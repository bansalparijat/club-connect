import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'

const createSchema = z.object({
  clubId: z.string().optional(),
  type: z.enum(['SPECIFIC_DATE', 'RECURRING_WEEKLY']),
  date: z.string().datetime().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startFrom: z.string().datetime().optional(),
  weeksAhead: z.number().int().min(1).max(52).optional(),
})

function unavailToDTO(u: {
  id: string; userId: string; clubId: string | null; type: string;
  date: Date | null; dayOfWeek: number | null; startFrom: Date | null;
  weeksAhead: number | null; createdAt: Date
}) {
  return {
    id: u.id, userId: u.userId, clubId: u.clubId, type: u.type,
    date: u.date?.toISOString() ?? null,
    dayOfWeek: u.dayOfWeek, startFrom: u.startFrom?.toISOString() ?? null,
    weeksAhead: u.weeksAhead, createdAt: u.createdAt.toISOString(),
  }
}

export const GET = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  const { searchParams } = new URL(req.url)
  const clubId = searchParams.get('clubId') ?? undefined

  const rules = await prisma.userUnavailability.findMany({
    where: { userId, ...(clubId ? { clubId } : {}) },
    orderBy: { createdAt: 'desc' },
  })

  return ok({ rules: rules.map(unavailToDTO) })
})

export const POST = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const { type, clubId, date, dayOfWeek, startFrom, weeksAhead } = parsed.data

  if (type === 'SPECIFIC_DATE' && !date) {
    return err.badRequest('date is required for SPECIFIC_DATE type')
  }
  if (type === 'RECURRING_WEEKLY' && (dayOfWeek === undefined || !startFrom)) {
    return err.badRequest('dayOfWeek and startFrom are required for RECURRING_WEEKLY type')
  }

  // If clubId provided, verify user is a member
  if (clubId) {
    const membership = await prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId } },
    })
    if (!membership) return err.forbidden('Not a member of this club')
  }

  const rule = await prisma.userUnavailability.create({
    data: {
      userId, clubId: clubId ?? null, type,
      date: date ? new Date(date) : null,
      dayOfWeek: dayOfWeek ?? null,
      startFrom: startFrom ? new Date(startFrom) : null,
      weeksAhead: weeksAhead ?? (type === 'RECURRING_WEEKLY' ? 4 : null),
    },
  })

  return created({ rule: unavailToDTO(rule) })
})
