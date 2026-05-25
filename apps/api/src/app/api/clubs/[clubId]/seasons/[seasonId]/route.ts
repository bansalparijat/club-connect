import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
})

function seasonToDTO(s: { id: string; clubId: string; name: string; startDate: Date; endDate: Date | null; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return { ...s, startDate: s.startDate.toISOString(), endDate: s.endDate?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
}

export const PATCH = withClubAdmin(async (req: NextRequest, ctx: RouteContext, _userId: string, clubId: string) => {
  const { seasonId } = ctx.params
  const season = await prisma.season.findFirst({ where: { id: seasonId, clubId } })
  if (!season) return err.notFound('Season')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const updateData: Record<string, unknown> = {}
  if (parsed.data.name) updateData.name = parsed.data.name
  if (parsed.data.startDate) updateData.startDate = new Date(parsed.data.startDate)
  if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null

  if (parsed.data.isActive === true) {
    // Deactivate all other seasons for this club
    await prisma.season.updateMany({ where: { clubId, id: { not: seasonId } }, data: { isActive: false } })
    updateData.isActive = true
  } else if (parsed.data.isActive === false) {
    updateData.isActive = false
  }

  const updated = await prisma.season.update({ where: { id: seasonId }, data: updateData })
  return ok({ season: seasonToDTO(updated) })
})
