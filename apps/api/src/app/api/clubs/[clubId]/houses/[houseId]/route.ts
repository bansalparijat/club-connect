import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, noContent, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  logoUrl: z.string().optional(),
})

export const PATCH = withClubAdmin(async (req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { houseId } = ctx.params
  const house = await prisma.house.findFirst({ where: { id: houseId, clubId } })
  if (!house) return err.notFound('House')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const updated = await prisma.house.update({ where: { id: houseId }, data: parsed.data })
  return ok({ house: updated })
})

export const DELETE = withClubAdmin(async (_req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { houseId } = ctx.params
  const house = await prisma.house.findFirst({ where: { id: houseId, clubId } })
  if (!house) return err.notFound('House')

  // Check if referenced by future matches
  const futureMatch = await prisma.matchHouse.findFirst({
    where: { houseId, match: { date: { gte: new Date() }, status: { not: 'CANCELLED' } } },
  })
  if (futureMatch) return err.unprocessable('Cannot delete house referenced by future matches')

  await prisma.house.delete({ where: { id: houseId } })
  return noContent()
})
