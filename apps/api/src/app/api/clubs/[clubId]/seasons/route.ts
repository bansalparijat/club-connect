import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
})

function seasonToDTO(s: { id: string; clubId: string; name: string; startDate: Date; endDate: Date | null; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return { ...s, startDate: s.startDate.toISOString(), endDate: s.endDate?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
}

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const { clubId } = ctx.params
  const membership = await prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId } } })
  if (!membership || membership.status !== 'ACTIVE') return err.forbidden()

  const seasons = await prisma.season.findMany({ where: { clubId }, orderBy: { startDate: 'desc' } })
  return ok({ seasons: seasons.map(seasonToDTO) })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const season = await prisma.season.create({
    data: {
      clubId,
      name: parsed.data.name,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    },
  })

  return created({ season: seasonToDTO(season) })
})
