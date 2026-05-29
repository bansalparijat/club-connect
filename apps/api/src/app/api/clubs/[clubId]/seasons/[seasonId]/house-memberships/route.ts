import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const schema = z.object({
  userId: z.string(),
  houseId: z.string(),
})

export const POST = withClubAdmin(async (req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { seasonId } = ctx.params

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const [season, house, membership] = await Promise.all([
    db.seasons.findById(clubId, seasonId),
    db.houses.findById(clubId, parsed.data.houseId),
    db.memberships.get(clubId, parsed.data.userId),
  ])

  if (!season) return err.notFound('Season')
  if (!house) return err.notFound('House')
  if (!membership || membership.status !== 'ACTIVE') return err.badRequest('User is not an active member of this club')

  const houseMembership = await db.houseMemberships.upsert({
    userId: parsed.data.userId, seasonId, houseId: parsed.data.houseId,
  })

  return ok({ houseMembership })
})
