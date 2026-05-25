import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withMatchAccess, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const schema = z.object({ markedPaid: z.literal(true) })

export const PATCH = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match || !match.feeAmount) return err.badRequest('This match does not have a fee')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Can only mark as paid (markedPaid must be true)')

  const payment = await prisma.matchFeePayment.findUnique({ where: { matchId_userId: { matchId, userId } } })
  if (!payment) return err.notFound('Fee payment record (you may not be confirmed for this match)')

  if (payment.markedPaid) return ok({ payment: { id: payment.id, matchId, userId, markedPaid: true, markedAt: payment.markedAt?.toISOString() ?? null } })

  const updated = await prisma.matchFeePayment.update({
    where: { id: payment.id },
    data: { markedPaid: true, markedAt: new Date() },
  })

  return ok({ payment: { id: updated.id, matchId, userId, markedPaid: true, markedAt: updated.markedAt?.toISOString() ?? null } })
})
