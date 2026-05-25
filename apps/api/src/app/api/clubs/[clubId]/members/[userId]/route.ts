import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
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

  const membership = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId, userId: targetUserId } },
  })
  if (!membership) return err.notFound('Membership')

  const updated = await prisma.clubMembership.update({
    where: { id: membership.id },
    data: parsed.data,
  })

  return ok({
    membership: {
      ...updated,
      joinedAt: updated.joinedAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
})

export const DELETE = withClubAdmin(async (_req: NextRequest, ctx: RouteContext, _adminId: string, clubId: string) => {
  const targetUserId = ctx.params.userId

  const membership = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId, userId: targetUserId } },
  })
  if (!membership) return err.notFound('Membership')

  await prisma.clubMembership.update({
    where: { id: membership.id },
    data: { status: 'LEFT' },
  })

  return noContent()
})
