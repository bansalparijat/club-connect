import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
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

export const GET = withMatchAccess(async (_req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')

  const [params, matchHouses, allAvail, feePayments, matchCaptains] = await Promise.all([
    db.matches.listParameters(matchId),
    db.matches.listHouses(matchId),
    db.availability.listByMatch(matchId),
    db.feePayments.listByMatch(matchId),
    db.captains.listByMatch(matchId),
  ])

  // Resolve house details
  const houseDetails = []
  for (const mh of matchHouses) {
    const h = await db.houses.findById(match.clubId, mh.houseId)
    if (h) houseDetails.push(h)
  }

  const confirmed = allAvail.filter(a => a.status === 'CONFIRMED')
  const waitlisted = allAvail.filter(a => a.status === 'WAITLISTED').sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const unavailable = allAvail.filter(a => a.status === 'UNAVAILABLE')
  const dropped = allAvail.filter(a => a.status === 'DROPPED')

  const myAvail = allAvail.find(a => a.userId === userId)
  const myFee = feePayments.find(f => f.userId === userId)

  const feeMap: Record<string, boolean> = {}
  feePayments.forEach(f => { feeMap[f.userId] = f.markedPaid })

  // Resolve house per player from HouseMembership
  let playerHouseMap: Record<string, { id: string; name: string; color: string | null; logoUrl: string | null }> = {}
  if (match.seasonId) {
    const allUserIds = allAvail.map(a => a.userId)
    const houseMembers = await db.houseMemberships.listByUserIds(match.seasonId, allUserIds)
    const clubHouses = await db.houses.listByClub(match.clubId)
    const houseById: Record<string, typeof clubHouses[0]> = {}
    clubHouses.forEach(h => { houseById[h.id] = h })
    houseMembers.forEach(hm => {
      const h = houseById[hm.houseId]
      if (h) playerHouseMap[hm.userId] = { id: h.id, name: h.name, color: h.color, logoUrl: h.logoUrl }
    })
  }

  function userDTO(a: typeof allAvail[0]) {
    return {
      id: a.userId, phone: a.userPhone, name: a.userName,
      profilePhotoUrl: a.userProfilePhotoUrl, isStub: a.userIsStub,
      createdAt: a.userCreatedAt,
    }
  }

  // Resolve captain user details
  const captainUsers = matchCaptains.map(c => {
    const avail = allAvail.find(a => a.userId === c.userId)
    return avail ? userDTO(avail) : { id: c.userId, phone: '', name: '', profilePhotoUrl: null, isStub: false, createdAt: '' }
  })

  return ok({
    match: { ...match, feeAmount: match.feeAmount?.toString() ?? null },
    parameters: params,
    houses: houseDetails,
    availability: {
      confirmed: confirmed.map(a => ({
        user: userDTO(a), respondedAt: a.respondedAt,
        house: playerHouseMap[a.userId] ?? null,
        hasPaid: feeMap[a.userId] ?? false,
      })),
      waitlisted: waitlisted.map(a => ({
        user: userDTO(a), position: a.position!,
        respondedAt: a.respondedAt,
        house: playerHouseMap[a.userId] ?? null,
        hasPaid: feeMap[a.userId] ?? false,
      })),
      unavailable: unavailable.map(a => ({ user: userDTO(a), respondedAt: a.respondedAt })),
      dropped: dropped.map(a => ({ user: userDTO(a), respondedAt: a.respondedAt })),
    },
    myStatus: myAvail?.status ?? null,
    fee: match.feeAmount
      ? { amount: match.feeAmount.toString(), currency: match.feeCurrency!, myMarkedPaid: myFee?.markedPaid ?? false }
      : null,
    captains: captainUsers,
  })
})

export const PATCH = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(userId, match.clubId))) return err.forbidden('Admin access required')
  if (match.status === 'CLOSED') return err.unprocessable('Match is closed and cannot be modified')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  if (parsed.data.capacity !== undefined && parsed.data.capacity < match.confirmedCount) {
    return err.unprocessable(`Cannot reduce capacity to ${parsed.data.capacity}: ${match.confirmedCount} players are already confirmed`)
  }

  const updated = await db.matches.update(matchId, parsed.data)
  return ok({ match: { ...updated, feeAmount: updated?.feeAmount?.toString() ?? null } })
})

export const DELETE = withMatchAccess(async (_req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(userId, match.clubId))) return err.forbidden('Admin access required')

  await db.matches.update(matchId, { status: 'CANCELLED' })

  const affected = await db.availability.listByMatch(matchId)
  const toNotify = affected.filter(a => a.status === 'CONFIRMED' || a.status === 'WAITLISTED')

  const club = await db.clubs.findById(match.clubId)
  const { date, time } = formatMatchDate(new Date(match.date))

  await enqueueBatch(
    toNotify.map(a => ({
      type: 'MATCH_CANCELLED' as const,
      payload: {
        userId: a.userId, phone: a.userPhone,
        templateName: 'club_connect_match_cancelled' as TemplateName,
        params: buildMatchCancelledParams({ clubName: club?.name ?? 'Club', date, time, venue: match.venue }),
      },
    }))
  )

  return noContent()
})
