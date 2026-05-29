import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #FF5733').optional(),
  logoUrl: z.string().optional(),
})

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params
  const membership = await db.memberships.get(clubId, userId)
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  const houses = await db.houses.listByClub(clubId)
  return ok({ houses })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const existing = await db.houses.findByName(clubId, parsed.data.name)
  if (existing) return err.conflict(`House "${parsed.data.name}" already exists`)

  const house = await db.houses.create({ clubId, ...parsed.data })
  return created({ house })
})
