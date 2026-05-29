import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('HouseRepo', () => {
  const clubId = 'club-house-test'

  it('creates and lists houses', async () => {
    await db.houses.create({ clubId, name: 'Red', color: '#FF0000' })
    await db.houses.create({ clubId, name: 'Blue', color: '#0000FF' })

    const houses = await db.houses.listByClub(clubId)
    expect(houses.length).toBe(2)
    expect(houses[0].name).toBe('Blue') // sorted alphabetically
    expect(houses[1].name).toBe('Red')
  })

  it('finds house by name', async () => {
    const house = await db.houses.findByName(clubId, 'Red')
    expect(house).not.toBeNull()
    expect(house!.color).toBe('#FF0000')
  })

  it('finds house by ID', async () => {
    const houses = await db.houses.listByClub(clubId)
    const found = await db.houses.findById(clubId, houses[0].id)
    expect(found).not.toBeNull()
  })

  it('finds houses by IDs', async () => {
    const houses = await db.houses.listByClub(clubId)
    const found = await db.houses.findByIds(clubId, houses.map(h => h.id))
    expect(found.length).toBe(2)
  })

  it('updates house', async () => {
    const houses = await db.houses.listByClub(clubId)
    const updated = await db.houses.update(clubId, houses[0].id, {
      color: '#00FF00', logoUrl: 'https://example.com/logo.png',
    })
    expect(updated!.color).toBe('#00FF00')
    expect(updated!.logoUrl).toBe('https://example.com/logo.png')
  })

  it('deletes house', async () => {
    const houses = await db.houses.listByClub(clubId)
    await db.houses.delete(clubId, houses[0].id)
    const remaining = await db.houses.listByClub(clubId)
    expect(remaining.length).toBe(1)
  })
})

describe('SeasonRepo', () => {
  const clubId = 'club-season-test'

  it('creates and lists seasons', async () => {
    await db.seasons.create({
      clubId, name: 'Season 1',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-06-30T00:00:00.000Z',
    })
    await db.seasons.create({
      clubId, name: 'Season 2',
      startDate: '2025-07-01T00:00:00.000Z',
    })

    const seasons = await db.seasons.listByClub(clubId)
    expect(seasons.length).toBe(2)
    expect(seasons[0].name).toBe('Season 2') // sorted desc by startDate
  })

  it('finds by ID', async () => {
    const seasons = await db.seasons.listByClub(clubId)
    const found = await db.seasons.findById(clubId, seasons[0].id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('Season 2')
  })

  it('syncs active statuses based on dates', async () => {
    const cid = 'club-sync-test'
    await db.seasons.create({
      clubId: cid, name: 'Past',
      startDate: '2020-01-01T00:00:00.000Z',
      endDate: '2020-06-30T00:00:00.000Z',
    })
    await db.seasons.create({
      clubId: cid, name: 'Current',
      startDate: '2020-01-01T00:00:00.000Z', // started in past, no end
    })

    await db.seasons.syncStatuses(cid)
    const seasons = await db.seasons.listByClub(cid)
    const past = seasons.find(s => s.name === 'Past')!
    const current = seasons.find(s => s.name === 'Current')!
    expect(past.isActive).toBe(false) // endDate passed
    expect(current.isActive).toBe(true) // started, no end, not ended
  })

  it('marks season as ended', async () => {
    const seasons = await db.seasons.listByClub(clubId)
    await db.seasons.update(clubId, seasons[0].id, { isEnded: true, isActive: false })
    const updated = await db.seasons.findById(clubId, seasons[0].id)
    expect(updated!.isEnded).toBe(true)
    expect(updated!.isActive).toBe(false)
  })
})

describe('HouseMembershipRepo', () => {
  const seasonId = 'season-hm-test'

  it('upserts house membership', async () => {
    const hm = await db.houseMemberships.upsert({
      userId: 'user1', seasonId, houseId: 'house-a',
    })
    expect(hm.houseId).toBe('house-a')
  })

  it('overrides house on re-upsert (switch house)', async () => {
    await db.houseMemberships.upsert({
      userId: 'user1', seasonId, houseId: 'house-b',
    })
    const hm = await db.houseMemberships.get(seasonId, 'user1')
    expect(hm!.houseId).toBe('house-b')
  })

  it('lists by season', async () => {
    await db.houseMemberships.upsert({ userId: 'user2', seasonId, houseId: 'house-a' })
    const all = await db.houseMemberships.listBySeason(seasonId)
    expect(all.length).toBe(2)
  })

  it('lists by user IDs', async () => {
    const found = await db.houseMemberships.listByUserIds(seasonId, ['user1', 'user2'])
    expect(found.length).toBe(2)
  })
})
