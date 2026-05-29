import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('MatchRepo', () => {
  const clubId = 'club-match-test'
  const tomorrow = new Date(Date.now() + 86400000).toISOString()

  it('creates a match with houses and parameters', async () => {
    const match = await db.matches.create({
      clubId, title: 'Sunday Match', date: tomorrow, venue: 'Central Park',
      capacity: 11, waitlistSize: 5, feeAmount: 200, feeCurrency: 'INR',
      createdById: 'user1',
      houseIds: ['house1', 'house2'],
      parameters: [{ key: 'Ball Type', value: 'Tennis' }],
    })

    expect(match.id).toBeTruthy()
    expect(match.status).toBe('OPEN')
    expect(match.confirmedCount).toBe(0)
    expect(match.feeAmount).toBe(200)
  })

  it('finds match by ID', async () => {
    const match = await db.matches.create({
      clubId, title: 'Find Me', date: tomorrow, venue: 'Park',
      capacity: 10, waitlistSize: 3, createdById: 'user1',
      houseIds: [], parameters: [],
    })
    const found = await db.matches.findById(match.id)
    expect(found!.title).toBe('Find Me')
  })

  it('lists houses for a match', async () => {
    const match = await db.matches.create({
      clubId, title: 'House Test', date: tomorrow, venue: 'Park',
      capacity: 10, waitlistSize: 3, createdById: 'user1',
      houseIds: ['h1', 'h2'], parameters: [],
    })
    const houses = await db.matches.listHouses(match.id)
    expect(houses.length).toBe(2)
    expect(houses.map(h => h.houseId).sort()).toEqual(['h1', 'h2'])
  })

  it('lists parameters for a match', async () => {
    const match = await db.matches.create({
      clubId, title: 'Param Test', date: tomorrow, venue: 'Park',
      capacity: 10, waitlistSize: 3, createdById: 'user1',
      houseIds: [],
      parameters: [
        { key: 'Ball', value: 'Leather' },
        { key: 'Format', value: 'T20' },
      ],
    })
    const params = await db.matches.listParameters(match.id)
    expect(params.length).toBe(2)
  })

  it('updates match fields', async () => {
    const match = await db.matches.create({
      clubId, title: 'Update Me', date: tomorrow, venue: 'Old Park',
      capacity: 10, waitlistSize: 3, createdById: 'user1',
      houseIds: [], parameters: [],
    })

    const updated = await db.matches.update(match.id, {
      venue: 'New Park', capacity: 15, status: 'CLOSED',
    })
    expect(updated!.venue).toBe('New Park')
    expect(updated!.capacity).toBe(15)
    expect(updated!.status).toBe('CLOSED')
  })

  it('lists matches by club sorted by date', async () => {
    const now = new Date()
    const date1 = new Date(now.getTime() + 1 * 86400000).toISOString()
    const date2 = new Date(now.getTime() + 2 * 86400000).toISOString()

    const cid = 'club-list-test'
    await db.matches.create({ clubId: cid, title: 'M1', date: date1, venue: 'V', capacity: 10, waitlistSize: 0, createdById: 'u', houseIds: [], parameters: [] })
    await db.matches.create({ clubId: cid, title: 'M2', date: date2, venue: 'V', capacity: 10, waitlistSize: 0, createdById: 'u', houseIds: [], parameters: [] })

    const matches = await db.matches.listByClub(cid, { ascending: true })
    expect(matches.length).toBe(2)
    expect(matches[0].title).toBe('M1')
    expect(matches[1].title).toBe('M2')
  })

  it('increments confirmed/waitlisted counts', async () => {
    const match = await db.matches.create({
      clubId, title: 'Count Test', date: tomorrow, venue: 'V',
      capacity: 5, waitlistSize: 3, createdById: 'user1',
      houseIds: [], parameters: [],
    })

    await db.matches.incrementCount(match.id, 'confirmedCount', 1)
    await db.matches.incrementCount(match.id, 'confirmedCount', 1)
    await db.matches.incrementCount(match.id, 'waitlistedCount', 1)

    const found = await db.matches.findById(match.id)
    expect(found!.confirmedCount).toBe(2)
    expect(found!.waitlistedCount).toBe(1)
  })
})
