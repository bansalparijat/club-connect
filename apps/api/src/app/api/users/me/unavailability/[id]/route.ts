import { NextRequest } from 'next/server'
import { db } from '@club-connect/db'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { noContent, err } from '@/lib/response'

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const rule = await db.unavailability.findById(ctx.params.id, userId)
  if (!rule || rule.userId !== userId) return err.notFound('Unavailability rule')

  await db.unavailability.delete(userId, ctx.params.id)
  return noContent()
})
