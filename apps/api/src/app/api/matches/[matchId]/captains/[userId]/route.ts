import { NextRequest } from 'next/server'
import { db } from '@club-connect/db'
import { withMatchAccess, isClubAdmin, type RouteContext } from '@/middleware/auth'
import { noContent, err } from '@/lib/response'

export const DELETE = withMatchAccess(async (_req: NextRequest, ctx: RouteContext, adminId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(adminId, match.clubId))) return err.forbidden('Admin access required')

  const captain = await db.captains.get(matchId, ctx.params.userId)
  if (!captain) return err.notFound('Captain assignment')

  await db.captains.delete(matchId, ctx.params.userId)
  return noContent()
})
