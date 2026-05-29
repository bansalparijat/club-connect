import { NextRequest } from 'next/server'
import { db } from '@club-connect/db'
import { withMatchAccess, isCaptainOrAdmin, type RouteContext } from '@/middleware/auth'
import { ok } from '@/lib/response'

export const GET = withMatchAccess(async (_req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match || !match.feeAmount) return ok({ payments: [], summary: null })

  const canSeeAll = await isCaptainOrAdmin(userId, matchId)

  if (!canSeeAll) {
    const payment = await db.feePayments.get(matchId, userId)
    return ok({
      payments: payment ? [{ user: null, markedPaid: payment.markedPaid, markedAt: payment.markedAt }] : [],
      summary: null,
    })
  }

  const payments = await db.feePayments.listByMatch(matchId)
  const paid = payments.filter(p => p.markedPaid).length

  // Get user details for each payment
  const result = []
  for (const p of payments) {
    const user = await db.users.findById(p.userId)
    result.push({
      user: user ? {
        id: user.id, name: user.name, phone: user.phone,
        profilePhotoUrl: user.profilePhotoUrl, isStub: user.isStub,
        createdAt: user.createdAt,
      } : null,
      markedPaid: p.markedPaid,
      markedAt: p.markedAt,
    })
  }

  return ok({
    payments: result,
    summary: { total: payments.length, paid, unpaid: payments.length - paid },
  })
})
