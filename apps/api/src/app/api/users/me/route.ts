import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withAuth, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  profilePhotoUrl: z.string().url().optional(),
})

export const GET = withAuth(async (_req: NextRequest, _ctx: RouteContext, userId: string) => {
  const user = await db.users.findById(userId)
  if (!user) return err.notFound('User')
  return ok({ user })
})

export const PATCH = withAuth(async (req: NextRequest, _ctx: RouteContext, userId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const update: { name?: string; profilePhotoUrl?: string; isStub?: boolean } = {}
  if (parsed.data.name) {
    update.name = parsed.data.name
    update.isStub = false
  }
  if (parsed.data.profilePhotoUrl !== undefined) update.profilePhotoUrl = parsed.data.profilePhotoUrl

  const user = await db.users.update(userId, update)
  if (!user) return err.notFound('User')
  return ok({ user })
})
