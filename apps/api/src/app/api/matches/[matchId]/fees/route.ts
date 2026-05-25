import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withMatchAccess, isCaptainOrAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

export const GET = withMatchAccess(async (_req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match || !match.feeAmount) return ok({ payments: [], summary: null })

  const canSeeAll = await isCaptainOrAdmin(userId, matchId)

  if (!canSeeAll) {
    const payment = await prisma.matchFeePayment.findUnique({ where: { matchId_userId: { matchId, userId } } })
    return ok({
      payments: payment ? [{ user: null, markedPaid: payment.markedPaid, markedAt: payment.markedAt?.toISOString() ?? null }] : [],
      summary: null,
    })
  }

  const payments = await prisma.matchFeePayment.findMany({
    where: { matchId },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  })

  const paid = payments.filter(p => p.markedPaid).length

  return ok({
    payments: payments.map(p => ({
      user: { id: p.user.id, name: p.user.name, phone: p.user.phone, profilePhotoUrl: p.user.profilePhotoUrl, isStub: p.user.isStub, createdAt: p.user.createdAt.toISOString() },
      markedPaid: p.markedPaid,
      markedAt: p.markedAt?.toISOString() ?? null,
    })),
    summary: { total: payments.length, paid, unpaid: payments.length - paid },
  })
})
