import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
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

export const GET = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  const { searchParams } = new URL(req.url)
  const clubId = searchParams.get('clubId') ?? undefined

  const rules = await db.unavailability.listByUser(userId, clubId)
  return ok({ rules })
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

  if (clubId) {
    const membership = await db.memberships.get(clubId, userId)
    if (!membership) return err.forbidden('Not a member of this club')
  }

  const rule = await db.unavailability.create({
    userId, clubId, type,
    date: date ?? undefined,
    dayOfWeek: dayOfWeek ?? undefined,
    startFrom: startFrom ?? undefined,
    weeksAhead: weeksAhead ?? (type === 'RECURRING_WEEKLY' ? 4 : undefined),
  })

  return created({ rule })
})
