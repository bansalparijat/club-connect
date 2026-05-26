import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withMatchAccess, isCaptainOrAdmin, isClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'
import { getNotificationService } from '@/lib/notifications'
import { buildWaitlistConfirmedParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

const markSchema = z.object({ status: z.enum(['AVAILABLE', 'UNAVAILABLE']) })
const updateSchema = z.object({ status: z.enum(['DROPPED', 'UNAVAILABLE', 'CONFIRMED']) })

function availToDTO(a: { id: string; matchId: string; userId: string; status: string; position: number | null; respondedAt: Date; updatedAt: Date }) {
  return { ...a, status: a.status, respondedAt: a.respondedAt.toISOString(), updatedAt: a.updatedAt.toISOString() }
}

// Promote the next waitlisted player to CONFIRMED after a slot opens up.
// Returns the newly confirmed user, or null if no one was waiting.
async function promoteNextWaitlisted(matchId: string): Promise<{ id: string; phone: string; name: string } | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return null

  const nextWaitlisted = await prisma.matchAvailability.findFirst({
    where: { matchId, status: 'WAITLISTED' },
    orderBy: { position: 'asc' },
    include: { user: true },
  })

  if (!nextWaitlisted) return null

  await prisma.matchAvailability.update({
    where: { id: nextWaitlisted.id },
    data: { status: 'CONFIRMED', position: null },
  })

  // Shift remaining waitlist positions down by 1
  await prisma.$executeRaw`
    UPDATE "MatchAvailability"
    SET position = position - 1
    WHERE "matchId" = ${matchId} AND status = 'WAITLISTED' AND position IS NOT NULL
  `

  // Create fee payment if match has fee
  if (match.feeAmount !== null) {
    await prisma.matchFeePayment.upsert({
      where: { matchId_userId: { matchId, userId: nextWaitlisted.userId } },
      update: {},
      create: { matchId, userId: nextWaitlisted.userId },
    })
  }

  // Send immediate WhatsApp notification
  const club = await prisma.club.findUnique({ where: { id: match.clubId } })
  const { date, time } = formatMatchDate(match.date)
  const feeReminderLine = match.feeAmount
    ? `Remember to mark your fee payment of ${match.feeCurrency} ${match.feeAmount} in the app.`
    : ''

  const ns = getNotificationService()
  await ns.send({
    userId: nextWaitlisted.userId,
    phone: nextWaitlisted.user.phone,
    templateName: 'club_connect_waitlist_confirmed' as TemplateName,
    params: buildWaitlistConfirmedParams({ clubName: club?.name ?? 'Club', date, time, feeReminderLine }),
    notificationType: 'WAITLIST_CONFIRMED',
    referenceId: matchId,
    referenceType: 'match',
  })

  return { id: nextWaitlisted.userId, phone: nextWaitlisted.user.phone, name: nextWaitlisted.user.name }
}

// Free the slot held by a user (CONFIRMED or WAITLISTED → target status).
// Handles waitlist promotion and fee cleanup.
async function releaseSlot(matchId: string, existingAvail: { id: string; userId: string; status: string; position: number | null }, targetStatus: 'UNAVAILABLE' | 'DROPPED') {
  // Clean up fee payment
  await prisma.matchFeePayment.deleteMany({ where: { matchId, userId: existingAvail.userId } })

  await prisma.matchAvailability.update({
    where: { id: existingAvail.id },
    data: { status: targetStatus, position: null },
  })

  if (existingAvail.status === 'CONFIRMED') {
    // Promote next waitlisted player
    return await promoteNextWaitlisted(matchId)
  }

  if (existingAvail.status === 'WAITLISTED' && existingAvail.position !== null) {
    // Shift remaining waitlist positions
    await prisma.$executeRaw`
      UPDATE "MatchAvailability"
      SET position = position - 1
      WHERE "matchId" = ${matchId} AND status = 'WAITLISTED' AND position > ${existingAvail.position}
    `
  }

  return null
}

export const POST = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return err.notFound('Match')
  if (match.status !== 'OPEN') return err.unprocessable(`Match is ${match.status.toLowerCase()} and not accepting availability changes`)

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = markSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const current = await prisma.matchAvailability.findUnique({ where: { matchId_userId: { matchId, userId } } })

  if (parsed.data.status === 'UNAVAILABLE') {
    // If the player holds a slot, free it before marking unavailable
    if (current && (current.status === 'CONFIRMED' || current.status === 'WAITLISTED')) {
      await releaseSlot(matchId, current, 'UNAVAILABLE')
      const updated = await prisma.matchAvailability.findUnique({ where: { matchId_userId: { matchId, userId } } })
      return ok({ availability: availToDTO(updated!) })
    }

    // Player has no slot — block if match is completely full (no open confirmed or waitlist slots)
    const confirmedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'CONFIRMED' } })
    const waitlistedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'WAITLISTED' } })
    if (confirmedCount >= match.capacity && waitlistedCount >= match.waitlistSize) {
      return err.unprocessable('Match is full. You cannot mark yourself unavailable.')
    }

    const avail = await prisma.matchAvailability.upsert({
      where: { matchId_userId: { matchId, userId } },
      update: { status: 'UNAVAILABLE', position: null },
      create: { matchId, userId, status: 'UNAVAILABLE' },
    })
    return ok({ availability: availToDTO(avail) })
  }

  // AVAILABLE: skip if already confirmed or waitlisted
  if (current && (current.status === 'CONFIRMED' || current.status === 'WAITLISTED')) {
    return ok({ availability: availToDTO(current as Parameters<typeof availToDTO>[0]) })
  }

  // Determine confirmed or waitlisted
  const confirmedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'CONFIRMED' } })
  const waitlistedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'WAITLISTED' } })

  let status: 'CONFIRMED' | 'WAITLISTED'
  let position: number | null = null

  if (confirmedCount < match.capacity) {
    status = 'CONFIRMED'
  } else if (waitlistedCount < match.waitlistSize) {
    status = 'WAITLISTED'
    position = waitlistedCount + 1
  } else {
    return err.unprocessable('Match is at capacity and the waitlist is full')
  }

  const avail = await prisma.matchAvailability.upsert({
    where: { matchId_userId: { matchId, userId } },
    update: { status, position },
    create: { matchId, userId, status, position },
  })

  // Create fee payment record if confirmed and match has fee
  if (status === 'CONFIRMED' && match.feeAmount !== null) {
    await prisma.matchFeePayment.upsert({
      where: { matchId_userId: { matchId, userId } },
      update: {},
      create: { matchId, userId },
    })
  }

  return ok({ availability: availToDTO(avail) })
})

export const PATCH = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return err.notFound('Match')

  // Determine target user (self or another via captain/admin)
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

  const existing = await prisma.matchAvailability.findUnique({ where: { matchId_userId: { matchId, userId: targetUserId } } })
  if (!existing) return err.notFound('Availability record')

  if (parsed.data.status === 'DROPPED' || parsed.data.status === 'UNAVAILABLE') {
    // If they held a slot, release it (triggers waitlist promotion if CONFIRMED)
    let newlyConfirmed: { id: string; phone: string; name: string } | null = null
    if (existing.status === 'CONFIRMED' || existing.status === 'WAITLISTED') {
      newlyConfirmed = await releaseSlot(matchId, existing, parsed.data.status)
    } else {
      // Just update status; no slot to release
      await prisma.matchAvailability.update({
        where: { id: existing.id },
        data: { status: parsed.data.status, position: null },
      })
    }

    const updated = await prisma.matchAvailability.findUnique({ where: { id: existing.id } })
    return ok({ availability: availToDTO(updated!), newlyConfirmed })
  }

  // CONFIRMED — admin/captain manually confirms a player
  // Find first open confirmed slot; if none, this is a capacity override by admin
  if (parsed.data.status === 'CONFIRMED') {
    const admin = await isClubAdmin(userId, match.clubId)
    if (!admin) return err.forbidden('Only admins can manually confirm players')

    // If currently waitlisted, clear their position and shift others
    if (existing.status === 'WAITLISTED' && existing.position !== null) {
      await prisma.$executeRaw`
        UPDATE "MatchAvailability"
        SET position = position - 1
        WHERE "matchId" = ${matchId} AND status = 'WAITLISTED' AND position > ${existing.position}
      `
    }

    const updated = await prisma.matchAvailability.update({
      where: { id: existing.id },
      data: { status: 'CONFIRMED', position: null },
    })

    // Create fee payment if needed
    if (match.feeAmount !== null) {
      await prisma.matchFeePayment.upsert({
        where: { matchId_userId: { matchId, userId: targetUserId } },
        update: {},
        create: { matchId, userId: targetUserId },
      })
    }

    return ok({ availability: availToDTO(updated), newlyConfirmed: null })
  }

  const updated = await prisma.matchAvailability.update({
    where: { id: existing.id },
    data: { status: parsed.data.status, position: null },
  })
  return ok({ availability: availToDTO(updated), newlyConfirmed: null })
})
