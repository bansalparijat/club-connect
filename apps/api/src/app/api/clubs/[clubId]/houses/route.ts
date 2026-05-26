import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #FF5733').optional(),
  logoUrl: z.string().optional(),
})

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params
  const membership = await prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId } } })
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  const houses = await prisma.house.findMany({ where: { clubId }, orderBy: { name: 'asc' } })
  return ok({ houses })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const existing = await prisma.house.findUnique({ where: { clubId_name: { clubId, name: parsed.data.name } } })
  if (existing) return err.conflict(`House "${parsed.data.name}" already exists`)

  const house = await prisma.house.create({ data: { clubId, ...parsed.data } })
  return created({ house })
})
