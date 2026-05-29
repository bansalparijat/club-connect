import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
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

export const GET = withAuth(async (req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params
  const membership = await db.memberships.get(clubId, userId)
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const seasonId = searchParams.get('seasonId') ?? undefined
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  let allMatches
  if (seasonId) {
    allMatches = await db.matches.listBySeason(seasonId)
    if (status) allMatches = allMatches.filter(m => m.status === status)
  } else {
    allMatches = await db.matches.listByClub(clubId, {
      status,
      from: from ?? new Date().toISOString(),
      to: to ?? undefined,
      ascending: true,
    })
  }

  const total = allMatches.length
  const start = (page - 1) * limit
  const matches = allMatches.slice(start, start + limit)

  // Get user's availability and fee data for these matches
  const matchIds = matches.map(m => m.id)
  const [userAvailabilities, userFeePayments] = await Promise.all([
    db.availability.listByUserAcrossMatches(userId, matchIds),
    db.feePayments.listByUserAcrossMatches(userId, matchIds),
  ])

  const availMap: Record<string, string> = {}
  userAvailabilities.forEach(a => { availMap[a.matchId] = a.status })
  const feeMap: Record<string, boolean> = {}
  userFeePayments.forEach(f => { feeMap[f.matchId] = f.markedPaid })

  // Get houses for each match
  const result = []
  for (const m of matches) {
    const matchHouses = await db.matches.listHouses(m.id)
    const houseDetails = []
    for (const mh of matchHouses) {
      const h = await db.houses.findById(m.clubId, mh.houseId)
      if (h) houseDetails.push(h)
    }

    result.push({
      id: m.id, title: m.title, date: m.date, venue: m.venue,
      status: m.status, capacity: m.capacity, waitlistSize: m.waitlistSize,
      confirmedCount: m.confirmedCount,
      waitlistedCount: m.waitlistedCount,
      myStatus: (availMap[m.id] ?? null) as string | null,
      hasFeeDue: m.feeAmount !== null && !feeMap[m.id],
      houses: houseDetails,
    })
  }

  return ok({ matches: result, total })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const { title, date, venue, capacity, waitlistSize, feeAmount, feeCurrency, houseIds, seasonId, parameters } = parsed.data

  const houses = await db.houses.findByIds(clubId, houseIds)
  if (houses.length !== houseIds.length) return err.badRequest('One or more house IDs are invalid')

  if (seasonId) {
    const season = await db.seasons.findById(clubId, seasonId)
    if (!season) return err.badRequest('Invalid season ID')
  }

  const match = await db.matches.create({
    clubId, seasonId, title, date, venue, capacity, waitlistSize,
    feeAmount, feeCurrency, createdById: userId, houseIds, parameters,
  })

  // Auto-mark unavailable members
  await autoMarkUnavailable(match.id, clubId, new Date(date))

  // Enqueue WhatsApp notifications
  const activeMembers = await db.memberships.listActiveWithNotifications(clubId)
  const club = await db.clubs.findById(clubId)
  const { date: fmtDate, time: fmtTime } = formatMatchDate(new Date(date))
  const teamsLine = houses.map(h => h.name).join(' vs ')
  const feeLine = feeAmount ? `Fee: ${feeCurrency ?? 'INR'} ${feeAmount}` : ''

  await enqueueBatch(
    activeMembers.map(m => ({
      type: 'MATCH_CREATED' as const,
      payload: {
        userId: m.userId,
        phone: m.userPhone,
        templateName: 'club_connect_match_created' as TemplateName,
        params: buildMatchCreatedParams({
          clubName: club?.name ?? 'Club',
          date: fmtDate, time: fmtTime, venue, teams: teamsLine, feeLine,
        }),
      },
    }))
  )

  return created({
    match: {
      ...match,
      feeAmount: match.feeAmount?.toString() ?? null,
    },
  })
})

async function autoMarkUnavailable(matchId: string, clubId: string, matchDate: Date) {
  const { items: activeMembers } = await db.memberships.listByClub(clubId, { status: 'ACTIVE' })
  const userIds = activeMembers.map(m => m.userId)

  const matchingRules = await db.unavailability.findMatchingRules(clubId, matchDate, userIds)
  if (matchingRules.length === 0) return

  const usersToMark = matchingRules.map(r => {
    const member = activeMembers.find(m => m.userId === r.userId)!
    return {
      userId: r.userId,
      userName: member.userName,
      userPhone: member.userPhone,
      userProfilePhotoUrl: member.userProfilePhotoUrl,
      userIsStub: member.userIsStub,
      userCreatedAt: member.userCreatedAt,
    }
  })

  await db.availability.createManyUnavailable(matchId, usersToMark)
}
