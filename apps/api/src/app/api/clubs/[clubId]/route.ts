import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withAuth, withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
})

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params

  const [club, membership] = await Promise.all([
    db.clubs.findById(clubId),
    db.memberships.get(clubId, userId),
  ])

  if (!club) return err.notFound('Club')
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  const [sportType, seasons, admins] = await Promise.all([
    db.sportTypes.findById(club.sportTypeId),
    db.seasons.listByClub(clubId),
    db.memberships.listAdminsByClub(clubId),
  ])

  const params = sportType ? await db.sportTypes.listParameters(sportType.id) : []
  const activeSeason = seasons.find(s => s.isActive) ?? null

  return ok({
    club,
    sportType: sportType ? { ...sportType, parameters: params } : null,
    myMembership: membership,
    activeSeason,
    memberCount: club.memberCount,
    admins: admins.map(m => ({
      id: m.userId, name: m.userName, phone: m.userPhone,
      profilePhotoUrl: m.userProfilePhotoUrl,
    })),
  })
})

export const PATCH = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const club = await db.clubs.update(clubId, parsed.data)
  if (!club) return err.notFound('Club')
  return ok({ club })
})
