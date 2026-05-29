import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, noContent, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  logoUrl: z.string().optional(),
})

export const PATCH = withClubAdmin(async (req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { houseId } = ctx.params
  const house = await db.houses.findById(clubId, houseId)
  if (!house) return err.notFound('House')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const updated = await db.houses.update(clubId, houseId, parsed.data)
  return ok({ house: updated })
})

export const DELETE = withClubAdmin(async (_req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { houseId } = ctx.params
  const house = await db.houses.findById(clubId, houseId)
  if (!house) return err.notFound('House')

  // Check if referenced by future matches
  const clubMatches = await db.matches.listByClub(clubId, {
    from: new Date().toISOString(),
    ascending: true,
  })
  for (const m of clubMatches) {
    if (m.status === 'CANCELLED') continue
    const matchHouses = await db.matches.listHouses(m.id)
    if (matchHouses.some(mh => mh.houseId === houseId)) {
      return err.unprocessable('Cannot delete house referenced by future matches')
    }
  }

  await db.houses.delete(clubId, houseId)
  return noContent()
})
