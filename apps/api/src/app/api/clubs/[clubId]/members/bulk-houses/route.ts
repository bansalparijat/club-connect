import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
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

  // Validate season belongs to club
  const season = await prisma.season.findFirst({ where: { id: seasonId, clubId } })
  if (!season) return err.notFound('Season')

  // Validate all houses belong to club
  const houseIds = [...new Set(assignments.map(a => a.houseId))]
  const houses = await prisma.house.findMany({ where: { id: { in: houseIds }, clubId } })
  if (houses.length !== houseIds.length) return err.badRequest('One or more house IDs are invalid')

  // Validate all users are active members
  const userIds = assignments.map(a => a.userId)
  const memberships = await prisma.clubMembership.findMany({
    where: { clubId, userId: { in: userIds }, status: 'ACTIVE' },
  })
  if (memberships.length !== userIds.length) return err.badRequest('One or more users are not active members')

  // Upsert house memberships
  await Promise.all(
    assignments.map(({ userId, houseId }) =>
      prisma.houseMembership.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, houseId },
        update: { houseId },
      })
    )
  )

  return ok({ updated: assignments.length })
})
