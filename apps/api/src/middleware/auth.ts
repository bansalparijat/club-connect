import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { err } from '@/lib/response'

export type RouteContext = { params: Record<string, string> }
export type Handler = (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>
export type AuthHandler = (req: NextRequest, ctx: RouteContext, userId: string) => Promise<NextResponse>
export type ClubAdminHandler = (req: NextRequest, ctx: RouteContext, userId: string, clubId: string) => Promise<NextResponse>
export type MatchHandler = (req: NextRequest, ctx: RouteContext, userId: string, matchId: string) => Promise<NextResponse>

export async function extractUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    const payload = await verifyAccessToken(token)
    return payload.sub
  } catch {
    return null
  }
}

export function withAuth(handler: AuthHandler): Handler {
  return async (req, ctx) => {
    const userId = await extractUserId(req)
    if (!userId) return err.unauthorized()
    return handler(req, ctx, userId)
  }
}

export function withClubAdmin(handler: ClubAdminHandler): Handler {
  return withAuth(async (req, ctx, userId) => {
    const clubId = ctx.params.clubId
    if (!clubId) return err.badRequest('Missing clubId')

    const membership = await prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId } },
    })

    if (!membership || membership.status !== 'ACTIVE') return err.forbidden()
    if (membership.role !== 'ADMIN') return err.forbidden('Admin access required')

    return handler(req, ctx, userId, clubId)
  }) as Handler
}

export function withMatchAccess(handler: MatchHandler): Handler {
  return withAuth(async (req, ctx, userId) => {
    const matchId = ctx.params.matchId
    if (!matchId) return err.badRequest('Missing matchId')

    const match = await prisma.match.findUnique({ where: { id: matchId } })
    if (!match) return err.notFound('Match')

    const membership = await prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId: match.clubId, userId } },
    })

    if (!membership || membership.status !== 'ACTIVE') {
      return err.forbidden('You are not a member of this club')
    }

    return handler(req, ctx, userId, matchId)
  }) as Handler
}

export async function isCaptainOrAdmin(userId: string, matchId: string): Promise<boolean> {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return false

  const [captain, membership] = await Promise.all([
    prisma.matchCaptain.findUnique({ where: { matchId_userId: { matchId, userId } } }),
    prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId: match.clubId, userId } } }),
  ])

  return !!captain || (!!membership && membership.role === 'ADMIN')
}

export async function isClubAdmin(userId: string, clubId: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId, userId } },
  })
  return !!membership && membership.status === 'ACTIVE' && membership.role === 'ADMIN'
}
