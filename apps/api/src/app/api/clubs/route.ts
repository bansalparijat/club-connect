import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sportTypeId: z.string(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
})

export const GET = withAuth(async (_req: NextRequest, _ctx: RouteContext, userId: string) => {
  const userMemberships = await db.memberships.listByUser(userId)
  const activeMemberships = userMemberships.filter(m => m.status === 'ACTIVE')

  const clubs = []
  for (const m of activeMemberships) {
    const club = await db.clubs.findById(m.clubId)
    if (!club) continue
    const sportType = await db.sportTypes.findById(club.sportTypeId)
    const params = sportType ? await db.sportTypes.listParameters(sportType.id) : []
    clubs.push({
      ...club,
      myRole: m.role,
      memberCount: club.memberCount,
      sportType: sportType ? { ...sportType, parameters: params } : null,
    })
  }

  return ok({ clubs })
})

export const POST = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const sportType = await db.sportTypes.findById(parsed.data.sportTypeId)
  if (!sportType) return err.notFound('Sport type')

  const club = await db.clubs.create({
    name: parsed.data.name,
    sportTypeId: parsed.data.sportTypeId,
    description: parsed.data.description,
    logoUrl: parsed.data.logoUrl,
    createdById: userId,
  })

  // Create admin membership
  const user = await db.users.findById(userId)
  await db.memberships.create({
    clubId: club.id, userId, role: 'ADMIN', status: 'ACTIVE',
    userName: user?.name ?? '', userPhone: user?.phone ?? '',
    userProfilePhotoUrl: user?.profilePhotoUrl ?? null,
    userIsStub: user?.isStub ?? false, userCreatedAt: user?.createdAt ?? '',
  })
  await db.clubs.incrementMemberCount(club.id, 1)

  return created({ club })
})
