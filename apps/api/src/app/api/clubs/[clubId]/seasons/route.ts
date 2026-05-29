import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
})

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params
  const membership = await db.memberships.get(clubId, userId)
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  await db.seasons.syncStatuses(clubId)
  const seasons = await db.seasons.listByClub(clubId)
  return ok({ seasons })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const season = await db.seasons.create({
    clubId,
    name: parsed.data.name,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  })

  return created({ season })
})
