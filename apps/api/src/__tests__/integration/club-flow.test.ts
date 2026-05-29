import { describe, it, expect } from 'vitest'
import { db } from '@club-connect/db'

describe('Club Flow (integration)', () => {
  let userId: string
  let clubId: string
  let sportTypeId: string

  it('seeds a sport type', async () => {
    const st = await db.sportTypes.create({ name: 'TestCricket' })
    sportTypeId = st.id
    await db.sportTypes.createParameter({
      sportTypeId: st.id, name: 'Ball', type: 'SELECT',
      options: ['Leather', 'Tennis'], isRequired: true, displayOrder: 1,
    })

    const params = await db.sportTypes.listParameters(st.id)
    expect(params.length).toBe(1)
  })

  it('creates a user who will be admin', async () => {
    const user = await db.users.create({ phone: '+919200000001', name: 'Club Admin', isStub: false })
    userId = user.id
  })

  it('creates a club with admin membership', async () => {
    const club = await db.clubs.create({
      name: 'Integration Club', sportTypeId,
      description: 'Test', createdById: userId,
    })
    clubId = club.id

    await db.memberships.create({
      clubId, userId, role: 'ADMIN', status: 'ACTIVE',
      userName: 'Club Admin', userPhone: '+919200000001',
      userProfilePhotoUrl: null, userIsStub: false,
      userCreatedAt: new Date().toISOString(),
    })
    await db.clubs.incrementMemberCount(clubId, 1)

    const found = await db.clubs.findById(clubId)
    expect(found!.memberCount).toBe(1)
  })

  it('adds a member to the club', async () => {
    const member = await db.users.create({ phone: '+919200000002', name: 'Member1', isStub: true })
    await db.memberships.create({
      clubId, userId: member.id, role: 'MEMBER', status: 'ACTIVE',
      userName: member.name, userPhone: member.phone,
      userProfilePhotoUrl: null, userIsStub: true,
      userCreatedAt: member.createdAt,
    })
    await db.clubs.incrementMemberCount(clubId, 1)

    const club = await db.clubs.findById(clubId)
    expect(club!.memberCount).toBe(2)

    const { items } = await db.memberships.listByClub(clubId, { status: 'ACTIVE' })
    expect(items.length).toBe(2)
  })

  it('creates houses for the club', async () => {
    await db.houses.create({ clubId, name: 'Lions', color: '#FF0000' })
    await db.houses.create({ clubId, name: 'Eagles', color: '#0000FF' })

    const houses = await db.houses.listByClub(clubId)
    expect(houses.length).toBe(2)
  })

  it('creates a season and assigns house memberships', async () => {
    const season = await db.seasons.create({
      clubId, name: 'Season 1',
      startDate: new Date(Date.now() - 86400000).toISOString(),
    })

    // Sync should make it active
    await db.seasons.syncStatuses(clubId)
    const active = await db.seasons.findActive(clubId)
    expect(active).not.toBeNull()
    expect(active!.id).toBe(season.id)

    const houses = await db.houses.listByClub(clubId)
    const { items: members } = await db.memberships.listByClub(clubId, { status: 'ACTIVE' })

    await db.houseMemberships.upsert({
      userId: members[0].userId, seasonId: season.id, houseId: houses[0].id,
    })
    await db.houseMemberships.upsert({
      userId: members[1].userId, seasonId: season.id, houseId: houses[1].id,
    })

    const hms = await db.houseMemberships.listBySeason(season.id)
    expect(hms.length).toBe(2)
  })

  it('verifies user sees the club in their list', async () => {
    const memberships = await db.memberships.listByUser(userId)
    expect(memberships.length).toBe(1)
    expect(memberships[0].clubId).toBe(clubId)
  })

  it('lists admins correctly', async () => {
    const admins = await db.memberships.listAdminsByClub(clubId)
    expect(admins.length).toBe(1)
    expect(admins[0].userId).toBe(userId)
  })
})
