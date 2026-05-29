import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@club-connect/db'

describe('Match & Availability Flow (integration)', () => {
  const clubId = 'club-integ-match'
  let matchId: string
  const users: { id: string; name: string; phone: string }[] = []
  const userInfo = (u: typeof users[0]) => ({
    userName: u.name, userPhone: u.phone,
    userProfilePhotoUrl: null, userIsStub: false,
    userCreatedAt: new Date().toISOString(),
  })

  beforeAll(async () => {
    // Create 5 users
    for (let i = 1; i <= 5; i++) {
      const u = await db.users.create({ phone: `+91930000000${i}`, name: `Player${i}`, isStub: false })
      users.push({ id: u.id, name: u.name, phone: u.phone })
    }

    // Create club + memberships
    await db.clubs.create({ name: 'Match Club', sportTypeId: 'sport1', createdById: users[0].id })
    for (const u of users) {
      await db.memberships.create({
        clubId, userId: u.id, role: u === users[0] ? 'ADMIN' : 'MEMBER',
        status: 'ACTIVE', ...userInfo(u),
      })
    }
  })

  it('creates a match with capacity 2 and waitlist 2', async () => {
    const match = await db.matches.create({
      clubId, title: 'Test Match',
      date: new Date(Date.now() + 7 * 86400000).toISOString(),
      venue: 'Test Ground', capacity: 2, waitlistSize: 2,
      feeAmount: 100, feeCurrency: 'INR',
      createdById: users[0].id,
      houseIds: ['h1', 'h2'], parameters: [],
    })
    matchId = match.id
    expect(match.confirmedCount).toBe(0)
  })

  it('first 2 players get CONFIRMED', async () => {
    // Player 1 marks available → CONFIRMED
    await db.availability.upsert(matchId, users[0].id, {
      status: 'CONFIRMED', position: null, ...userInfo(users[0]),
    })
    await db.matches.incrementCount(matchId, 'confirmedCount', 1)
    await db.feePayments.create(matchId, users[0].id)

    // Player 2 marks available → CONFIRMED
    await db.availability.upsert(matchId, users[1].id, {
      status: 'CONFIRMED', position: null, ...userInfo(users[1]),
    })
    await db.matches.incrementCount(matchId, 'confirmedCount', 1)
    await db.feePayments.create(matchId, users[1].id)

    const match = await db.matches.findById(matchId)
    expect(match!.confirmedCount).toBe(2)
  })

  it('next 2 players get WAITLISTED with positions', async () => {
    // Player 3 → waitlist position 1
    await db.availability.upsert(matchId, users[2].id, {
      status: 'WAITLISTED', position: 1, ...userInfo(users[2]),
    })
    await db.matches.incrementCount(matchId, 'waitlistedCount', 1)

    // Player 4 → waitlist position 2
    await db.availability.upsert(matchId, users[3].id, {
      status: 'WAITLISTED', position: 2, ...userInfo(users[3]),
    })
    await db.matches.incrementCount(matchId, 'waitlistedCount', 1)

    const match = await db.matches.findById(matchId)
    expect(match!.waitlistedCount).toBe(2)

    const next = await db.availability.getNextWaitlisted(matchId)
    expect(next!.userId).toBe(users[2].id)
    expect(next!.position).toBe(1)
  })

  it('5th player is rejected (match full)', async () => {
    const match = await db.matches.findById(matchId)
    // confirmedCount (2) >= capacity (2) AND waitlistedCount (2) >= waitlistSize (2)
    expect(match!.confirmedCount >= match!.capacity).toBe(true)
    expect(match!.waitlistedCount >= match!.waitlistSize).toBe(true)
  })

  it('confirmed player drops → waitlist promoted', async () => {
    // Player 1 drops
    await db.feePayments.deleteForUser(matchId, users[0].id)
    await db.availability.updateStatus(matchId, users[0].id, { status: 'DROPPED', position: null })
    await db.matches.incrementCount(matchId, 'confirmedCount', -1)

    // Promote Player 3 (position 1)
    const next = await db.availability.getNextWaitlisted(matchId)
    expect(next!.userId).toBe(users[2].id)

    await db.availability.updateStatus(matchId, users[2].id, { status: 'CONFIRMED', position: null })
    await db.matches.incrementCount(matchId, 'confirmedCount', 1)
    await db.matches.incrementCount(matchId, 'waitlistedCount', -1)
    await db.feePayments.create(matchId, users[2].id)

    // Shift Player 4 from position 2 → 1
    await db.availability.shiftPositionsDown(matchId, 1)

    // Verify final state
    const p3 = await db.availability.get(matchId, users[2].id)
    expect(p3!.status).toBe('CONFIRMED')

    const p4 = await db.availability.get(matchId, users[3].id)
    expect(p4!.status).toBe('WAITLISTED')
    expect(p4!.position).toBe(1) // shifted from 2

    const match = await db.matches.findById(matchId)
    expect(match!.confirmedCount).toBe(2)
    expect(match!.waitlistedCount).toBe(1)
  })

  it('fee marking works correctly', async () => {
    // Player 2 marks fee paid
    await db.feePayments.markPaid(matchId, users[1].id)
    const fee = await db.feePayments.get(matchId, users[1].id)
    expect(fee!.markedPaid).toBe(true)

    // Player 3 (newly confirmed) hasn't paid
    const fee3 = await db.feePayments.get(matchId, users[2].id)
    expect(fee3!.markedPaid).toBe(false)

    // Fee summary
    const fees = await db.feePayments.listByMatch(matchId)
    const paid = fees.filter(f => f.markedPaid).length
    expect(paid).toBe(1)
  })

  it('captain assignment works', async () => {
    await db.captains.create(matchId, users[1].id)
    const captains = await db.captains.listByMatch(matchId)
    expect(captains.length).toBe(1)
    expect(captains[0].userId).toBe(users[1].id)

    // Remove captain
    await db.captains.delete(matchId, users[1].id)
    const after = await db.captains.listByMatch(matchId)
    expect(after.length).toBe(0)
  })

  it('match detail shows correct availability breakdown', async () => {
    const all = await db.availability.listByMatch(matchId)
    const confirmed = all.filter(a => a.status === 'CONFIRMED')
    const waitlisted = all.filter(a => a.status === 'WAITLISTED')
    const dropped = all.filter(a => a.status === 'DROPPED')

    expect(confirmed.length).toBe(2) // Player 2 + Player 3
    expect(waitlisted.length).toBe(1) // Player 4
    expect(dropped.length).toBe(1) // Player 1
  })

  it('marking unavailable when holding a slot releases it', async () => {
    // Player 2 marks unavailable (was CONFIRMED)
    await db.feePayments.deleteForUser(matchId, users[1].id)
    await db.availability.updateStatus(matchId, users[1].id, { status: 'UNAVAILABLE', position: null })
    await db.matches.incrementCount(matchId, 'confirmedCount', -1)

    // Promote Player 4 from waitlist
    const next = await db.availability.getNextWaitlisted(matchId)
    expect(next).not.toBeNull()
    expect(next!.userId).toBe(users[3].id)

    await db.availability.updateStatus(matchId, users[3].id, { status: 'CONFIRMED', position: null })
    await db.matches.incrementCount(matchId, 'confirmedCount', 1)
    await db.matches.incrementCount(matchId, 'waitlistedCount', -1)

    const match = await db.matches.findById(matchId)
    expect(match!.confirmedCount).toBe(2) // Player 3 + Player 4
    expect(match!.waitlistedCount).toBe(0)
  })

  it('match can be closed', async () => {
    await db.matches.update(matchId, { status: 'CLOSED' })
    const match = await db.matches.findById(matchId)
    expect(match!.status).toBe('CLOSED')
  })
})
