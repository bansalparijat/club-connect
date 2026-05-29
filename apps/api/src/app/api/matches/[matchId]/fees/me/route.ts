import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withMatchAccess, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const schema = z.object({ markedPaid: z.literal(true) })

export const PATCH = withMatchAccess(async (req: NextRequest, _ctx: RouteContext, userId: string, matchId: string) => {
  const match = await db.matches.findById(matchId)
  if (!match || !match.feeAmount) return err.badRequest('This match does not have a fee')

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Can only mark as paid (markedPaid must be true)')

  const payment = await db.feePayments.get(matchId, userId)
  if (!payment) return err.notFound('Fee payment record (you may not be confirmed for this match)')

  if (payment.markedPaid) return ok({ payment })

  const updated = await db.feePayments.markPaid(matchId, userId)
  return ok({ payment: updated })
})
