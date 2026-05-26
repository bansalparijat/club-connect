import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withMatchAccess, isClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, noContent, err } from '@/lib/response'
import { enqueueBatch } from '@/lib/sqs'
import { buildMatchCancelledParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  date: z.string().datetime().optional(),
  venue: z.string().min(1).max(200).optional(),
  capacity: z.number().int().min(1).optional(),
  waitlistSize: z.number().int().min(0).optional(),
  feeAmount: z.number().positive().nullable().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']).optional(),
})

function matchToDTO(m: { id: string; clubId: string; title: string; date: Date; venue: string; capacity: number; waitlistSize: number; feeAmount: unknown; feeCurrency: string | null; status: string; createdById: string; createdAt: Date; updatedAt: Date }) {
  return { ...m, date: m.date.toISOString(), feeAmount: m.feeAmount?.toString() ?? null, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }
}

export const GET = withMatchAccess(async (_req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      parameters: true,
      houses: { include: { house: true } },
      captains: { include: { user: true } },
      availability: {
        include: { user: true },
        orderBy: [{ position: 'asc' }, { respondedAt: 'asc' }],
      },
      feePayments: true,
    },
  })
  if (!match) return err.notFound('Match')

  const confirmed = match.availability.filter(a => a.status === 'CONFIRMED')
  const waitlisted = match.availability.filter(a => a.status === 'WAITLISTED')
  const unavailable = match.availability.filter(a => a.status === 'UNAVAILABLE')
  const dropped = match.availability.filter(a => a.status === 'DROPPED')

  const myAvailability = match.availability.find(a => a.user.id === userId)
  const myFeePayment = match.feePayments.find(f => f.userId === userId)

  // Build fee payment map
  const feeMap: Record<string, boolean> = {}
  match.feePayments.forEach(f => { feeMap[f.userId] = f.markedPaid })

  // Fetch house assignments for players
  const seasonId = match.seasonId
  let playerHouseMap: Record<string, { id: string; name: string; color: string | null; logoUrl: string | null }> = {}
  if (seasonId) {
    const allUserIds = match.availability.map(a => a.userId)
    const houseMembers = await prisma.houseMembership.findMany({
      where: { userId: { in: allUserIds }, seasonId },
      include: { house: true },
    })
    houseMembers.forEach(hm => {
      playerHouseMap[hm.userId] = { id: hm.house.id, name: hm.house.name, color: hm.house.color, logoUrl: hm.house.logoUrl }
    })
  }

  function userToDTO(u: { id: string; phone: string; name: string; profilePhotoUrl: string | null; isStub: boolean; createdAt: Date }) {
    return { ...u, createdAt: u.createdAt.toISOString() }
  }

  return ok({
    match: matchToDTO(match),
    parameters: match.parameters,
    houses: match.houses.map(mh => mh.house),
    availability: {
      confirmed: confirmed.map(a => ({
        user: userToDTO(a.user),
        respondedAt: a.respondedAt.toISOString(),
        house: playerHouseMap[a.userId] ?? null,
        hasPaid: feeMap[a.userId] ?? false,
      })),
      waitlisted: waitlisted.map(a => ({
        user: userToDTO(a.user),
        position: a.position!,
        respondedAt: a.respondedAt.toISOString(),
        house: playerHouseMap[a.userId] ?? null,
        hasPaid: feeMap[a.userId] ?? false,
      })),
      unavailable: unavailable.map(a => ({ user: userToDTO(a.user), respondedAt: a.respondedAt.toISOString() })),
      dropped: dropped.map(a => ({ user: userToDTO(a.user), respondedAt: a.respondedAt.toISOString() })),
    },
    myStatus: myAvailability?.status ?? null,
    fee: match.feeAmount
      ? { amount: match.feeAmount.toString(), currency: match.feeCurrency!, myMarkedPaid: myFeePayment?.markedPaid ?? false }
      : null,
    captains: match.captains.map(c => userToDTO(c.user)),
  })
})

export const PATCH = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(userId, match.clubId))) return err.forbidden('Admin access required')

  if (match.status === 'CLOSED') return err.unprocessable('Match is closed and cannot be modified')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  if (parsed.data.capacity !== undefined) {
    const confirmedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'CONFIRMED' } })
    if (parsed.data.capacity < confirmedCount) {
      return err.unprocessable(`Cannot reduce capacity to ${parsed.data.capacity}: ${confirmedCount} players are already confirmed`)
    }
  }

  const updateData: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.date) updateData.date = new Date(parsed.data.date)

  const updated = await prisma.match.update({ where: { id: matchId }, data: updateData })
  return ok({ match: matchToDTO(updated) })
})

export const DELETE = withMatchAccess(async (_req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(userId, match.clubId))) return err.forbidden('Admin access required')

  await prisma.match.update({ where: { id: matchId }, data: { status: 'CANCELLED' } })

  // Notify confirmed + waitlisted
  const affected = await prisma.matchAvailability.findMany({
    where: { matchId, status: { in: ['CONFIRMED', 'WAITLISTED'] } },
    include: { user: true },
  })

  const club = await prisma.club.findUnique({ where: { id: match.clubId } })
  const { date, time } = formatMatchDate(match.date)

  await enqueueBatch(
    affected.map(a => ({
      type: 'MATCH_CANCELLED' as const,
      payload: {
        userId: a.userId,
        phone: a.user.phone,
        templateName: 'club_connect_match_cancelled' as TemplateName,
        params: buildMatchCancelledParams({ clubName: club?.name ?? 'Club', date, time, venue: match.venue }),
      },
    }))
  )

  return noContent()
})
