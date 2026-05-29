import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('AvailabilityRepo', () => {
  const matchId = 'match-avail-test'
  const userInfo = {
    userName: 'Player', userPhone: '+91900001',
    userProfilePhotoUrl: null, userIsStub: false,
    userCreatedAt: new Date().toISOString(),
  }

  it('upserts availability as CONFIRMED', async () => {
    const a = await db.availability.upsert(matchId, 'user1', {
      status: 'CONFIRMED', position: null, ...userInfo,
    })
    expect(a.status).toBe('CONFIRMED')
    expect(a.position).toBeNull()
  })

  it('upserts availability as WAITLISTED with position', async () => {
    const a = await db.availability.upsert(matchId, 'user2', {
      status: 'WAITLISTED', position: 1,
      ...userInfo, userName: 'Waiter1',
    })
    expect(a.status).toBe('WAITLISTED')
    expect(a.position).toBe(1)

    await db.availability.upsert(matchId, 'user3', {
      status: 'WAITLISTED', position: 2,
      ...userInfo, userName: 'Waiter2',
    })
  })

  it('gets specific availability', async () => {
    const a = await db.availability.get(matchId, 'user1')
    expect(a).not.toBeNull()
    expect(a!.status).toBe('CONFIRMED')
  })

  it('returns null for non-existent availability', async () => {
    expect(await db.availability.get(matchId, 'ghost')).toBeNull()
  })

  it('lists all availability for a match', async () => {
    const all = await db.availability.listByMatch(matchId)
    expect(all.length).toBe(3)
  })

  it('filters by status', async () => {
    const confirmed = await db.availability.listByMatchAndStatus(matchId, 'CONFIRMED')
    expect(confirmed.length).toBe(1)
    expect(confirmed[0].userId).toBe('user1')

    const waitlisted = await db.availability.listByMatchAndStatus(matchId, 'WAITLISTED')
    expect(waitlisted.length).toBe(2)
  })

  it('counts by status', async () => {
    expect(await db.availability.countByStatus(matchId, 'CONFIRMED')).toBe(1)
    expect(await db.availability.countByStatus(matchId, 'WAITLISTED')).toBe(2)
    expect(await db.availability.countByStatus(matchId, 'UNAVAILABLE')).toBe(0)
  })

  it('gets next waitlisted (position 1)', async () => {
    const next = await db.availability.getNextWaitlisted(matchId)
    expect(next).not.toBeNull()
    expect(next!.position).toBe(1)
    expect(next!.userId).toBe('user2')
  })

  it('updates status (promote from waitlist)', async () => {
    const updated = await db.availability.updateStatus(matchId, 'user2', {
      status: 'CONFIRMED', position: null,
    })
    expect(updated!.status).toBe('CONFIRMED')
    expect(updated!.position).toBeNull()
  })

  it('shifts positions down', async () => {
    // user3 was at position 2, after user2 (position 1) was promoted, shift down
    await db.availability.shiftPositionsDown(matchId, 1)
    const user3 = await db.availability.get(matchId, 'user3')
    expect(user3!.position).toBe(1) // shifted from 2 to 1
  })

  it('creates multiple UNAVAILABLE records in batch', async () => {
    const mid = 'match-batch-test'
    await db.availability.createManyUnavailable(mid, [
      { userId: 'u1', ...userInfo, userName: 'U1' },
      { userId: 'u2', ...userInfo, userName: 'U2' },
      { userId: 'u3', ...userInfo, userName: 'U3' },
    ])
    const unavail = await db.availability.listByMatchAndStatus(mid, 'UNAVAILABLE')
    expect(unavail.length).toBe(3)
  })
})
