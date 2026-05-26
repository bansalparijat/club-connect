import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
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
    prisma.club.findUnique({
      where: { id: clubId },
      include: {
        sportType: { include: { parameters: { orderBy: { displayOrder: 'asc' } } } },
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
        seasons: { where: { isActive: true }, take: 1 },
        memberships: {
          where: { role: 'ADMIN', status: 'ACTIVE' },
          include: { user: { select: { id: true, name: true, phone: true, profilePhotoUrl: true } } },
        },
      },
    }),
    prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId } } }),
  ])

  if (!club) return err.notFound('Club')
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  return ok({
    club: { ...club, createdAt: club.createdAt.toISOString(), updatedAt: club.updatedAt.toISOString() },
    sportType: club.sportType,
    myMembership: { ...membership, joinedAt: membership.joinedAt.toISOString(), updatedAt: membership.updatedAt.toISOString() },
    activeSeason: club.seasons[0] ? { ...club.seasons[0], startDate: club.seasons[0].startDate.toISOString(), endDate: club.seasons[0].endDate?.toISOString() ?? null, createdAt: club.seasons[0].createdAt.toISOString(), updatedAt: club.seasons[0].updatedAt.toISOString() } : null,
    memberCount: club._count.memberships,
    admins: club.memberships.map((m) => m.user),
  })
})

export const PATCH = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const club = await prisma.club.update({ where: { id: clubId }, data: parsed.data })
  return ok({ club: { ...club, createdAt: club.createdAt.toISOString(), updatedAt: club.updatedAt.toISOString() } })
})
