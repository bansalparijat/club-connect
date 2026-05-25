import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
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
    prisma.season.findFirst({ where: { id: seasonId, clubId } }),
    prisma.house.findFirst({ where: { id: parsed.data.houseId, clubId } }),
    prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId: parsed.data.userId } } }),
  ])

  if (!season) return err.notFound('Season')
  if (!house) return err.notFound('House')
  if (!membership || membership.status !== 'ACTIVE') return err.badRequest('User is not an active member of this club')

  const houseMembership = await prisma.houseMembership.upsert({
    where: { userId_seasonId: { userId: parsed.data.userId, seasonId } },
    update: { houseId: parsed.data.houseId },
    create: { userId: parsed.data.userId, seasonId, houseId: parsed.data.houseId },
  })

  return ok({ houseMembership })
})
