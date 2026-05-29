import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@club-connect/db'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, created, err } from '@/lib/response'
import { normalizePhone } from '@/lib/otp'

const addMemberSchema = z.object({
  phone: z.string().min(7).max(16),
  name: z.string().min(1).max(100),
  houseId: z.string().optional(),
})

function memberToDTO(m: Awaited<ReturnType<typeof db.memberships.get>> & { house?: { id: string; clubId: string; name: string; color: string | null } | null }) {
  if (!m) return null
  return {
    id: `${m.clubId}_${m.userId}`, clubId: m.clubId, userId: m.userId,
    role: m.role, status: m.status,
    notificationsEnabled: m.notificationsEnabled,
    joinedAt: m.joinedAt, updatedAt: m.updatedAt,
    user: {
      id: m.userId, phone: m.userPhone, name: m.userName,
      profilePhotoUrl: m.userProfilePhotoUrl, isStub: m.userIsStub,
      createdAt: m.userCreatedAt,
    },
    house: m.house ?? null,
  }
}

export const GET = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const role = searchParams.get('role') ?? undefined
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')))

  const activeSeason = await db.seasons.findActive(clubId)

  const { items: allMembers } = await db.memberships.listByClub(clubId, { status, role, search })

  // Paginate client-side (DynamoDB returned all matching)
  const total = allMembers.length
  const start = (page - 1) * limit
  const members = allMembers.slice(start, start + limit)

  // Fetch house assignments if active season
  let houseMap: Record<string, { id: string; clubId: string; name: string; color: string | null }> = {}
  if (activeSeason) {
    const userIds = members.map(m => m.userId)
    const houseMembers = await db.houseMemberships.listByUserIds(activeSeason.id, userIds)
    const houses = await db.houses.listByClub(clubId)
    const houseById: Record<string, typeof houses[0]> = {}
    houses.forEach(h => { houseById[h.id] = h })
    houseMembers.forEach(hm => {
      const h = houseById[hm.houseId]
      if (h) houseMap[hm.userId] = { id: h.id, clubId: h.clubId, name: h.name, color: h.color }
    })
  }

  return ok({
    members: members.map(m => memberToDTO({ ...m, house: houseMap[m.userId] ?? null })),
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

  if (houseId) {
    const house = await db.houses.findById(clubId, houseId)
    if (!house) return err.badRequest('Invalid house ID')
  }

  let user = await db.users.findByPhone(phone)
  const isNew = !user
  if (!user) {
    user = await db.users.create({ phone, name: parsed.data.name, isStub: true })
  }

  const existing = await db.memberships.get(clubId, user.id)

  let membership
  if (existing) {
    if (existing.status === 'ACTIVE') return err.conflict('User is already a member of this club')
    membership = await db.memberships.update(clubId, user.id, { status: 'ACTIVE' })
  } else {
    membership = await db.memberships.create({
      clubId, userId: user.id, role: 'MEMBER', status: 'ACTIVE',
      userName: user.name, userPhone: user.phone,
      userProfilePhotoUrl: user.profilePhotoUrl,
      userIsStub: user.isStub, userCreatedAt: user.createdAt,
    })
    await db.clubs.incrementMemberCount(clubId, 1)
  }

  let houseAssignment = null
  if (houseId) {
    const activeSeason = await db.seasons.findActive(clubId)
    if (activeSeason) {
      await db.houseMemberships.upsert({ userId: user.id, seasonId: activeSeason.id, houseId })
      const house = await db.houses.findById(clubId, houseId)
      if (house) houseAssignment = { id: house.id, clubId: house.clubId, name: house.name, color: house.color }
    }
  }

  const dto = memberToDTO({ ...(membership ?? existing!), house: houseAssignment })
  if (existing) {
    return ok({ membership: dto, user, isNew: false })
  }
  return created({ membership: dto, user, isNew })
})
