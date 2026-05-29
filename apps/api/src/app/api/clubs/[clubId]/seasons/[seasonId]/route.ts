import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  isEnded: z.boolean().optional(),
})

export const PATCH = withClubAdmin(async (req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { seasonId } = ctx.params
  const season = await db.seasons.findById(clubId, seasonId)
  if (!season) return err.notFound('Season')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const updateData: Record<string, unknown> = {}
  if (parsed.data.name) updateData.name = parsed.data.name
  if (parsed.data.startDate) updateData.startDate = parsed.data.startDate
  if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate || null

  if (parsed.data.isEnded === true) {
    updateData.isEnded = true
    updateData.isActive = false
  }

  if (parsed.data.isActive === true && !parsed.data.isEnded) {
    await db.seasons.deactivateOthers(clubId, seasonId)
    updateData.isActive = true
    updateData.isEnded = false
  } else if (parsed.data.isActive === false) {
    updateData.isActive = false
  }

  const updated = await db.seasons.update(clubId, seasonId, updateData as Parameters<typeof db.seasons.update>[2])
  return ok({ season: updated })
})
