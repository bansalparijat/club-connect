import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sportTypeId: z.string(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
})

export const GET = withAuth(async (_req: NextRequest, _ctx: RouteContext, userId: string) => {
  const memberships = await prisma.clubMembership.findMany({
    where: { userId, status: 'ACTIVE' },
    include: {
      club: {
        include: {
          sportType: { include: { parameters: { orderBy: { displayOrder: 'asc' } } } },
          _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
  })

  const clubs = memberships.map((m) => ({
    ...m.club,
    createdAt: m.club.createdAt.toISOString(),
    updatedAt: m.club.updatedAt.toISOString(),
    myRole: m.role,
    memberCount: m.club._count.memberships,
    sportType: m.club.sportType,
  }))

  return ok({ clubs })
})

export const POST = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const sportType = await prisma.sportType.findUnique({ where: { id: parsed.data.sportTypeId } })
  if (!sportType) return err.notFound('Sport type')

  const club = await prisma.club.create({
    data: {
      name: parsed.data.name,
      sportTypeId: parsed.data.sportTypeId,
      description: parsed.data.description,
      logoUrl: parsed.data.logoUrl,
      createdById: userId,
      memberships: {
        create: { userId, role: 'ADMIN', status: 'ACTIVE' },
      },
    },
  })

  return created({ club: { ...club, createdAt: club.createdAt.toISOString(), updatedAt: club.updatedAt.toISOString() } })
})
