import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withMatchAccess, isClubAdmin, type RouteContext } from '@/middleware/auth'
import { created, err } from '@/lib/response'

const schema = z.object({ userId: z.string() })

export const POST = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(userId, match.clubId))) return err.forbidden('Admin access required')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const availability = await db.availability.get(matchId, parsed.data.userId)
  if (!availability || availability.status !== 'CONFIRMED') {
    return err.badRequest('User must be confirmed for the match to be assigned as captain')
  }

  const existing = await db.captains.get(matchId, parsed.data.userId)
  if (existing) return err.conflict('User is already a captain for this match')

  const captain = await db.captains.create(matchId, parsed.data.userId)
  return created({ captain })
})
