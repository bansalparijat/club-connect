import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withMatchAccess, isCaptainOrAdmin, isClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'
import { getNotificationService } from '@/lib/notifications'
import { buildWaitlistConfirmedParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

const markSchema = z.object({ status: z.enum(['AVAILABLE', 'UNAVAILABLE']) })
const updateSchema = z.object({ status: z.enum(['DROPPED', 'UNAVAILABLE', 'CONFIRMED']) })

async function getUserInfo(userId: string) {
  const user = await db.users.findById(userId)
  return {
    userName: user?.name ?? '',
    userPhone: user?.phone ?? '',
    userProfilePhotoUrl: user?.profilePhotoUrl ?? null,
    userIsStub: user?.isStub ?? false,
    userCreatedAt: user?.createdAt ?? '',
  }
}

async function promoteNextWaitlisted(matchId: string): Promise<{ id: string; phone: string; name: string } | null> {
  const match = await db.matches.findById(matchId)
  if (!match) return null

  const next = await db.availability.getNextWaitlisted(matchId)
  if (!next) return null

  await db.availability.updateStatus(matchId, next.userId, { status: 'CONFIRMED', position: null })
  await db.matches.incrementCount(matchId, 'confirmedCount', 1)
  await db.matches.incrementCount(matchId, 'waitlistedCount', -1)

  // Shift remaining waitlist positions
  await db.availability.shiftPositionsDown(matchId, next.position!)

  // Create fee payment if match has fee
  if (match.feeAmount !== null) {
    await db.feePayments.create(matchId, next.userId)
  }

  // Send immediate WhatsApp
  const club = await db.clubs.findById(match.clubId)
  const { date, time } = formatMatchDate(new Date(match.date))
  const feeReminderLine = match.feeAmount
    ? `Remember to mark your fee payment of ${match.feeCurrency} ${match.feeAmount} in the app.`
    : ''

  const ns = getNotificationService()
  await ns.send({
    userId: next.userId, phone: next.userPhone,
    templateName: 'club_connect_waitlist_confirmed' as TemplateName,
    params: buildWaitlistConfirmedParams({ clubName: club?.name ?? 'Club', date, time, feeReminderLine }),
    notificationType: 'WAITLIST_CONFIRMED',
    referenceId: matchId, referenceType: 'match',
  })

  return { id: next.userId, phone: next.userPhone, name: next.userName }
}

async function releaseSlot(matchId: string, existing: NonNullable<Awaited<ReturnType<typeof db.availability.get>>>, targetStatus: 'UNAVAILABLE' | 'DROPPED') {
  await db.feePayments.deleteForUser(matchId, existing.userId)
  await db.availability.updateStatus(matchId, existing.userId, { status: targetStatus, position: null })

  if (existing.status === 'CONFIRMED') {
    await db.matches.incrementCount(matchId, 'confirmedCount', -1)
    return await promoteNextWaitlisted(matchId)
  }

  if (existing.status === 'WAITLISTED' && existing.position !== null) {
    await db.matches.incrementCount(matchId, 'waitlistedCount', -1)
    await db.availability.shiftPositionsDown(matchId, existing.position)
  }

  return null
}

export const POST = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')
  if (match.status !== 'OPEN') return err.unprocessable(`Match is ${match.status.toLowerCase()} and not accepting availability changes`)

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = markSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const current = await db.availability.get(matchId, userId)
  const userInfo = await getUserInfo(userId)

  if (parsed.data.status === 'UNAVAILABLE') {
    if (current && (current.status === 'CONFIRMED' || current.status === 'WAITLISTED')) {
      await releaseSlot(matchId, current, 'UNAVAILABLE')
      const updated = await db.availability.get(matchId, userId)
      return ok({ availability: updated })
    }

    // Block if match is completely full
    if (match.confirmedCount >= match.capacity && match.waitlistedCount >= match.waitlistSize) {
      return err.unprocessable('Match is full. You cannot mark yourself unavailable.')
    }

    const avail = await db.availability.upsert(matchId, userId, {
      status: 'UNAVAILABLE', position: null, ...userInfo,
    })
    return ok({ availability: avail })
  }

  // AVAILABLE: skip if already confirmed or waitlisted
  if (current && (current.status === 'CONFIRMED' || current.status === 'WAITLISTED')) {
    return ok({ availability: current })
  }

  let status: 'CONFIRMED' | 'WAITLISTED'
  let position: number | null = null

  if (match.confirmedCount < match.capacity) {
    status = 'CONFIRMED'
  } else if (match.waitlistedCount < match.waitlistSize) {
    status = 'WAITLISTED'
    position = match.waitlistedCount + 1
  } else {
    return err.unprocessable('Match is at capacity and the waitlist is full')
  }

  const avail = await db.availability.upsert(matchId, userId, {
    status, position, ...userInfo,
  })

  await db.matches.incrementCount(matchId, status === 'CONFIRMED' ? 'confirmedCount' : 'waitlistedCount', 1)

  if (status === 'CONFIRMED' && match.feeAmount !== null) {
    await db.feePayments.create(matchId, userId)
  }

  return ok({ availability: avail })
})

export const PATCH = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')

  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('userId') ?? userId

  if (targetUserId !== userId) {
    const canManage = await isCaptainOrAdmin(userId, matchId)
    if (!canManage) return err.forbidden('Only captains and admins can update other members availability')
  }

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const existing = await db.availability.get(matchId, targetUserId)
  if (!existing) return err.notFound('Availability record')

  if (parsed.data.status === 'DROPPED' || parsed.data.status === 'UNAVAILABLE') {
    let newlyConfirmed: { id: string; phone: string; name: string } | null = null
    if (existing.status === 'CONFIRMED' || existing.status === 'WAITLISTED') {
      newlyConfirmed = await releaseSlot(matchId, existing, parsed.data.status)
    } else {
      await db.availability.updateStatus(matchId, targetUserId, { status: parsed.data.status, position: null })
    }

    const updated = await db.availability.get(matchId, targetUserId)
    return ok({ availability: updated, newlyConfirmed })
  }

  // CONFIRMED — admin manually confirms
  if (parsed.data.status === 'CONFIRMED') {
    const admin = await isClubAdmin(userId, match.clubId)
    if (!admin) return err.forbidden('Only admins can manually confirm players')

    if (existing.status === 'WAITLISTED' && existing.position !== null) {
      await db.matches.incrementCount(matchId, 'waitlistedCount', -1)
      await db.availability.shiftPositionsDown(matchId, existing.position)
    }

    await db.availability.updateStatus(matchId, targetUserId, { status: 'CONFIRMED', position: null })
    await db.matches.incrementCount(matchId, 'confirmedCount', 1)

    if (match.feeAmount !== null) {
      await db.feePayments.create(matchId, targetUserId)
    }

    const updated = await db.availability.get(matchId, targetUserId)
    return ok({ availability: updated, newlyConfirmed: null })
  }

  await db.availability.updateStatus(matchId, targetUserId, { status: parsed.data.status, position: null })
  const updated = await db.availability.get(matchId, targetUserId)
  return ok({ availability: updated, newlyConfirmed: null })
})
