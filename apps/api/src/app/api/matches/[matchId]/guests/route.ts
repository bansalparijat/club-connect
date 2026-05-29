import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
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

  const match = await db.matches.findById(matchId)
  if (!match || match.status !== 'OPEN') return err.unprocessable('Match is not open for changes')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const phone = normalizePhone(parsed.data.phone)

  let user = await db.users.findByPhone(phone)
  const isNew = !user
  if (!user) {
    user = await db.users.create({ phone, name: parsed.data.name, isStub: true })
  }

  // Ensure club membership
  let membership = await db.memberships.get(match.clubId, user.id)
  if (!membership) {
    membership = await db.memberships.create({
      clubId: match.clubId, userId: user.id, role: 'MEMBER', status: 'ACTIVE',
      userName: user.name, userPhone: user.phone,
      userProfilePhotoUrl: user.profilePhotoUrl,
      userIsStub: user.isStub, userCreatedAt: user.createdAt,
    })
    await db.clubs.incrementMemberCount(match.clubId, 1)
  } else if (membership.status !== 'ACTIVE') {
    await db.memberships.update(match.clubId, user.id, { status: 'ACTIVE' })
  }

  let status: 'CONFIRMED' | 'WAITLISTED' = 'WAITLISTED'
  let position: number | null = null

  if (match.confirmedCount < match.capacity) {
    status = 'CONFIRMED'
  } else if (match.waitlistedCount < match.waitlistSize) {
    status = 'WAITLISTED'
    position = match.waitlistedCount + 1
  }

  const availability = await db.availability.upsert(matchId, user.id, {
    status, position,
    userName: user.name, userPhone: user.phone,
    userProfilePhotoUrl: user.profilePhotoUrl,
    userIsStub: user.isStub, userCreatedAt: user.createdAt,
  })

  await db.matches.incrementCount(matchId, status === 'CONFIRMED' ? 'confirmedCount' : 'waitlistedCount', 1)

  if (status === 'CONFIRMED' && match.feeAmount !== null) {
    await db.feePayments.create(matchId, user.id)
  }

  return created({ user, membership, availability, isNew })
})
