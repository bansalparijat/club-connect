import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'
import { enqueueBatch } from '@/lib/sqs'
import {
  buildMatchCreatedParams, formatMatchDate,
  type TemplateName
} from '@club-connect/notifications'

const createSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().datetime(),
  venue: z.string().min(1).max(200),
  capacity: z.number().int().min(1).max(500),
  waitlistSize: z.number().int().min(0).max(100),
  feeAmount: z.number().positive().optional(),
  feeCurrency: z.string().length(3).optional(),
  houseIds: z.array(z.string()).length(2, 'Exactly 2 houses required'),
  seasonId: z.string().optional(),
  parameters: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
    sportParamId: z.string().optional(),
    isCustom: z.boolean().optional(),
  })),
})

function matchToDTO(m: { id: string; clubId: string; title: string; date: Date; venue: string; capacity: number; waitlistSize: number; feeAmount: unknown; feeCurrency: string | null; status: string; createdById: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: m.id, clubId: m.clubId, title: m.title,
    date: m.date.toISOString(), venue: m.venue,
    capacity: m.capacity, waitlistSize: m.waitlistSize,
    feeAmount: m.feeAmount?.toString() ?? null,
    feeCurrency: m.feeCurrency, status: m.status,
    createdById: m.createdById,
    createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString(),
  }
}

export const GET = withAuth(async (req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params
  const membership = await prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId } } })
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))
  const skip = (page - 1) * limit

  const where = {
    clubId,
    ...(status ? { status: status as 'OPEN' | 'CLOSED' | 'CANCELLED' | 'DRAFT' } : { status: { not: 'CANCELLED' as const } }),
    date: {
      ...(from ? { gte: new Date(from) } : { gte: new Date() }),
      ...(to ? { lte: new Date(to) } : {}),
    },
  }

  const [matches, total] = await Promise.all([
    prisma.match.findMany({
      where,
      include: {
        houses: { include: { house: true } },
        _count: {
          select: {
            availability: { where: { status: 'CONFIRMED' } },
          },
        },
      },
      skip,
      take: limit,
      orderBy: { date: 'asc' },
    }),
    prisma.match.count({ where }),
  ])

  // Get user's availability status for these matches
  const matchIds = matches.map(m => m.id)
  const [userAvailabilities, userFeePayments, waitlistCounts] = await Promise.all([
    prisma.matchAvailability.findMany({ where: { matchId: { in: matchIds }, userId } }),
    prisma.matchFeePayment.findMany({ where: { matchId: { in: matchIds }, userId } }),
    prisma.matchAvailability.groupBy({
      by: ['matchId'],
      where: { matchId: { in: matchIds }, status: 'WAITLISTED' },
      _count: true,
    }),
  ])

  const availMap: Record<string, string> = {}
  userAvailabilities.forEach(a => { availMap[a.matchId] = a.status })

  const feeMap: Record<string, boolean> = {}
  userFeePayments.forEach(f => { feeMap[f.matchId] = f.markedPaid })

  const waitlistMap: Record<string, number> = {}
  waitlistCounts.forEach(w => { waitlistMap[w.matchId] = w._count })

  const result = matches.map(m => ({
    id: m.id, title: m.title, date: m.date.toISOString(), venue: m.venue,
    status: m.status, capacity: m.capacity, waitlistSize: m.waitlistSize,
    confirmedCount: m._count.availability,
    waitlistedCount: waitlistMap[m.id] ?? 0,
    myStatus: (availMap[m.id] ?? null) as string | null,
    hasFeeDue: m.feeAmount !== null && !feeMap[m.id],
    houses: m.houses.map(mh => mh.house),
  }))

  return ok({ matches: result, total })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const { title, date, venue, capacity, waitlistSize, feeAmount, feeCurrency, houseIds, seasonId, parameters } = parsed.data

  // Validate houses belong to this club
  const houses = await prisma.house.findMany({ where: { id: { in: houseIds }, clubId } })
  if (houses.length !== houseIds.length) return err.badRequest('One or more house IDs are invalid')

  // Validate season belongs to this club
  if (seasonId) {
    const season = await prisma.season.findFirst({ where: { id: seasonId, clubId } })
    if (!season) return err.badRequest('Invalid season ID')
  }

  const matchDate = new Date(date)

  const match = await prisma.match.create({
    data: {
      clubId, title, date: matchDate, venue, capacity, waitlistSize,
      feeAmount: feeAmount ?? null, feeCurrency: feeCurrency ?? 'INR',
      seasonId: seasonId ?? null,
      createdById: userId,
      houses: { create: houseIds.map(houseId => ({ houseId })) },
      parameters: { create: parameters.map(p => ({ key: p.key, value: p.value, sportParamId: p.sportParamId ?? null, isCustom: p.isCustom ?? false })) },
    },
  })

  // Auto-mark unavailable members
  await autoMarkUnavailable(match.id, clubId, matchDate)

  // Enqueue WhatsApp notifications for all active members
  const activeMembers = await prisma.clubMembership.findMany({
    where: { clubId, status: 'ACTIVE', notificationsEnabled: true },
    include: { user: true },
  })

  const club = await prisma.club.findUnique({ where: { id: clubId } })
  const { date: fmtDate, time: fmtTime } = formatMatchDate(matchDate)
  const teamsLine = houses.map(h => h.name).join(' vs ')
  const feeLine = feeAmount ? `Fee: ${feeCurrency ?? 'INR'} ${feeAmount}` : ''

  await enqueueBatch(
    activeMembers.map(m => ({
      type: 'MATCH_CREATED' as const,
      payload: {
        userId: m.userId,
        phone: m.user.phone,
        templateName: 'club_connect_match_created' as TemplateName,
        params: buildMatchCreatedParams({
          clubName: club?.name ?? 'Club',
          date: fmtDate,
          time: fmtTime,
          venue,
          teams: teamsLine,
          feeLine,
        }),
      },
    }))
  )

  return created({ match: matchToDTO(match) })
})

async function autoMarkUnavailable(matchId: string, clubId: string, matchDate: Date) {
  const dayOfWeek = matchDate.getDay()

  const matchDayStart = new Date(matchDate.toDateString())
  const matchDayEnd = new Date(matchDate.toDateString() + ' 23:59:59')

  const unavailableUsers = await prisma.userUnavailability.findMany({
    where: {
      AND: [
        { OR: [{ clubId }, { clubId: null }] },
        { user: { clubMemberships: { some: { clubId, status: 'ACTIVE' } } } },
        {
          OR: [
            { type: 'SPECIFIC_DATE', date: { gte: matchDayStart, lte: matchDayEnd } },
            { type: 'RECURRING_WEEKLY', dayOfWeek, startFrom: { lte: matchDate } },
          ],
        },
      ],
    },
    include: { user: true },
  })

  if (unavailableUsers.length === 0) return

  // Filter recurring — only apply if matchDate is within the weeks range
  const eligible = unavailableUsers.filter(u => {
    if (u.type === 'SPECIFIC_DATE') return true
    if (u.type === 'RECURRING_WEEKLY' && u.startFrom && u.weeksAhead) {
      const endDate = new Date(u.startFrom)
      endDate.setDate(endDate.getDate() + u.weeksAhead * 7)
      return matchDate <= endDate
    }
    return false
  })

  await prisma.matchAvailability.createMany({
    data: eligible.map(u => ({ matchId, userId: u.userId, status: 'UNAVAILABLE' })),
    skipDuplicates: true,
  })
}
