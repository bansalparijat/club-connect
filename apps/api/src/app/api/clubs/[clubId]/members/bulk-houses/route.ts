import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const bulkSchema = z.object({
  seasonId: z.string(),
  assignments: z.array(z.object({
    userId: z.string(),
    houseId: z.string(),
  })).min(1),
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const { seasonId, assignments } = parsed.data

  const season = await db.seasons.findById(clubId, seasonId)
  if (!season) return err.notFound('Season')

  const houseIds = [...new Set(assignments.map(a => a.houseId))]
  const houses = await db.houses.findByIds(clubId, houseIds)
  if (houses.length !== houseIds.length) return err.badRequest('One or more house IDs are invalid')

  const userIds = assignments.map(a => a.userId)
  const memberChecks = await Promise.all(userIds.map(uid => db.memberships.get(clubId, uid)))
  const activeCount = memberChecks.filter(m => m?.status === 'ACTIVE').length
  if (activeCount !== userIds.length) return err.badRequest('One or more users are not active members')

  await Promise.all(
    assignments.map(({ userId, houseId }) =>
      db.houseMemberships.upsert({ userId, seasonId, houseId })
    )
  )

  return ok({ updated: assignments.length })
})
