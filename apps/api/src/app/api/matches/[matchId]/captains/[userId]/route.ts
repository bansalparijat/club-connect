import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withMatchAccess, isClubAdmin, type RouteContext } from '@/middleware/auth'
import { noContent, err } from '@/lib/response'

export const DELETE = withMatchAccess(async (_req: NextRequest, ctx: RouteContext, adminId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return err.notFound('Match')

  if (!(await isClubAdmin(adminId, match.clubId))) return err.forbidden('Admin access required')

  const captain = await prisma.matchCaptain.findUnique({
    where: { matchId_userId: { matchId, userId: ctx.params.userId } },
  })
  if (!captain) return err.notFound('Captain assignment')

  await prisma.matchCaptain.delete({ where: { id: captain.id } })
  return noContent()
})
