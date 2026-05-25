import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  profilePhotoUrl: z.string().url().optional(),
})

function userToDTO(user: { id: string; phone: string; name: string; profilePhotoUrl: string | null; isStub: boolean; createdAt: Date }) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    profilePhotoUrl: user.profilePhotoUrl,
    isStub: user.isStub,
    createdAt: user.createdAt.toISOString(),
  }
}

export const GET = withAuth(async (_req: NextRequest, _ctx: RouteContext, userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return err.notFound('User')
  return ok({ user: userToDTO(user) })
})

export const PATCH = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const update: { name?: string; profilePhotoUrl?: string; isStub?: boolean } = {}
  if (parsed.data.name) {
    update.name = parsed.data.name
    update.isStub = false // Completing profile deactivates stub status
  }
  if (parsed.data.profilePhotoUrl !== undefined) update.profilePhotoUrl = parsed.data.profilePhotoUrl

  const user = await prisma.user.update({ where: { id: userId }, data: update })
  return ok({ user: userToDTO(user) })
})
