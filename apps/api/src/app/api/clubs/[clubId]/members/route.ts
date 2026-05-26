import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, withAuth, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'
import { normalizePhone } from '@/lib/otp'

const addMemberSchema = z.object({
  phone: z.string().min(7).max(16),
  name: z.string().min(1).max(100),
  houseId: z.string().optional(),
})

function memberToDTO(m: {
  id: string; clubId: string; userId: string; role: string; status: string;
  notificationsEnabled: boolean; joinedAt: Date; updatedAt: Date;
  user: { id: string; phone: string; name: string; profilePhotoUrl: string | null; isStub: boolean; createdAt: Date };
  houseAssignment?: { house: { id: string; clubId: string; name: string; color: string | null } } | null
}) {
  return {
    id: m.id, clubId: m.clubId, userId: m.userId, role: m.role, status: m.status,
    notificationsEnabled: m.notificationsEnabled,
    joinedAt: m.joinedAt.toISOString(), updatedAt: m.updatedAt.toISOString(),
    user: { ...m.user, createdAt: m.user.createdAt.toISOString() },
    house: m.houseAssignment?.house ?? null,
  }
}

export const GET = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'ACTIVE'
  const role = searchParams.get('role') ?? undefined
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')))
  const skip = (page - 1) * limit

  // Get active season for house lookup
  const activeSeason = await prisma.season.findFirst({ where: { clubId, isActive: true } })

  const [members, total] = await Promise.all([
    prisma.clubMembership.findMany({
      where: {
        clubId,
        status: status as 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'LEFT',
        ...(role ? { role: role as 'ADMIN' | 'MEMBER' } : {}),
        user: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } : undefined,
      },
      include: {
        user: true,
        ...(activeSeason ? {
          user: { include: {} }
        } : {}),
      },
      skip,
      take: limit,
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.clubMembership.count({
      where: { clubId, status: status as 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'LEFT' },
    }),
  ])

  // Fetch house assignments separately if there's an active season
  let houseMap: Record<string, { id: string; clubId: string; name: string; color: string | null }> = {}
  if (activeSeason) {
    const houseMembers = await prisma.houseMembership.findMany({
      where: {
        userId: { in: members.map(m => m.userId) },
        seasonId: activeSeason.id,
      },
      include: { house: true },
    })
    houseMembers.forEach(hm => { houseMap[hm.userId] = hm.house })
  }

  return ok({
    members: members.map(m => memberToDTO({ ...m, houseAssignment: houseMap[m.userId] ? { house: houseMap[m.userId] } : null })),
    total,
  })
})

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = addMemberSchema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const phone = normalizePhone(parsed.data.phone)
  const { houseId } = parsed.data

  // Validate houseId if provided
  if (houseId) {
    const house = await prisma.house.findFirst({ where: { id: houseId, clubId } })
    if (!house) return err.badRequest('Invalid house ID')
  }

  // Find or create user
  let user = await prisma.user.findUnique({ where: { phone } })
  const isNew = !user
  if (!user) {
    user = await prisma.user.create({
      data: { phone, name: parsed.data.name, isStub: true },
    })
  }

  // Check if already a member
  const existing = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId, userId: user.id } },
  })

  let membership
  if (existing) {
    if (existing.status === 'ACTIVE') return err.conflict('User is already a member of this club')
    membership = await prisma.clubMembership.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE' },
      include: { user: true },
    })
  } else {
    membership = await prisma.clubMembership.create({
      data: { clubId, userId: user.id, role: 'MEMBER', status: 'ACTIVE' },
      include: { user: true },
    })
  }

  // Assign to house in active season if houseId provided
  let houseAssignment = null
  if (houseId) {
    const activeSeason = await prisma.season.findFirst({ where: { clubId, isActive: true } })
    if (activeSeason) {
      await prisma.houseMembership.upsert({
        where: { userId_seasonId: { userId: user.id, seasonId: activeSeason.id } },
        create: { userId: user.id, seasonId: activeSeason.id, houseId },
        update: { houseId },
      })
      const house = await prisma.house.findUnique({ where: { id: houseId } })
      if (house) houseAssignment = { house }
    }
  }

  if (existing) {
    return ok({ membership: memberToDTO({ ...membership, houseAssignment }), user: membership.user, isNew: false })
  }
  return created({ membership: memberToDTO({ ...membership, houseAssignment }), user: { ...user, createdAt: user.createdAt.toISOString() }, isNew })
})
