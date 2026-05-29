import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, noContent, err } from '@/lib/response'

const updateSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'LEFT']).optional(),
})

export const PATCH = withClubAdmin(async (req: NextRequest, ctx: RouteContext, _adminId: string, clubId: string) => {
  const targetUserId = ctx.params.userId

  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const membership = await db.memberships.get(clubId, targetUserId)
  if (!membership) return err.notFound('Membership')

  const updated = await db.memberships.update(clubId, targetUserId, parsed.data)
  return ok({ membership: updated })
})

export const DELETE = withClubAdmin(async (_req: NextRequest, ctx: RouteContext, _adminId: string, clubId: string) => {
  const targetUserId = ctx.params.userId

  const membership = await db.memberships.get(clubId, targetUserId)
  if (!membership) return err.notFound('Membership')

  await db.memberships.update(clubId, targetUserId, { status: 'LEFT' })
  return noContent()
})
