import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withMatchAccess, isCaptainOrAdmin, type RouteContext } from '@/middleware/auth'
import { created, err } from '@/lib/response'
import { normalizePhone } from '@/lib/otp'

const schema = z.object({
  phone: z.string().min(7).max(16),
  name: z.string().min(1).max(100),
})

export const POST = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const canAdd = await isCaptainOrAdmin(userId, matchId)
  if (!canAdd) return err.forbidden('Only captains and admins can add guests')

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match || match.status !== 'OPEN') return err.unprocessable('Match is not open for changes')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const phone = normalizePhone(parsed.data.phone)

  // Find or create user (stub)
  let user = await prisma.user.findUnique({ where: { phone } })
  const isNew = !user
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: parsed.data.name, isStub: true } })
  }

  // Ensure club membership
  let membership = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId: match.clubId, userId: user.id } },
  })
  if (!membership) {
    membership = await prisma.clubMembership.create({
      data: { clubId: match.clubId, userId: user.id, role: 'MEMBER', status: 'ACTIVE' },
    })
  } else if (membership.status !== 'ACTIVE') {
    membership = await prisma.clubMembership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } })
  }

  // Determine availability status
  const confirmedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'CONFIRMED' } })
  const waitlistedCount = await prisma.matchAvailability.count({ where: { matchId, status: 'WAITLISTED' } })

  let status: 'CONFIRMED' | 'WAITLISTED' = 'WAITLISTED'
  let position: number | null = null

  if (confirmedCount < match.capacity) {
    status = 'CONFIRMED'
  } else if (waitlistedCount < match.waitlistSize) {
    status = 'WAITLISTED'
    position = waitlistedCount + 1
  }

  const availability = await prisma.matchAvailability.upsert({
    where: { matchId_userId: { matchId, userId: user.id } },
    update: { status, position },
    create: { matchId, userId: user.id, status, position },
  })

  if (status === 'CONFIRMED' && match.feeAmount !== null) {
    await prisma.matchFeePayment.upsert({
      where: { matchId_userId: { matchId, userId: user.id } },
      update: {},
      create: { matchId, userId: user.id },
    })
  }

  return created({
    user: { ...user, createdAt: user.createdAt.toISOString() },
    membership: { ...membership, joinedAt: membership.joinedAt.toISOString(), updatedAt: membership.updatedAt.toISOString() },
    availability: { ...availability, respondedAt: availability.respondedAt.toISOString(), updatedAt: availability.updatedAt.toISOString() },
    isNew,
  })
})
