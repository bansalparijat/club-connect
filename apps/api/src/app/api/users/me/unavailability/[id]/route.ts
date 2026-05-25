import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { noContent, err } from '@/lib/response'

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext, userId: string) => {
  const rule = await prisma.userUnavailability.findUnique({ where: { id: ctx.params.id } })
  if (!rule || rule.userId !== userId) return err.notFound('Unavailability rule')

  await prisma.userUnavailability.delete({ where: { id: ctx.params.id } })
  return noContent()
})
