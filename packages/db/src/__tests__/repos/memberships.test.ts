import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('MembershipRepo', () => {
  const clubId = 'club-mem-test'
  const userId1 = 'user-m1'
  const userId2 = 'user-m2'

  it('creates a membership and retrieves it', async () => {
    const m = await db.memberships.create({
      clubId, userId: userId1, role: 'ADMIN', status: 'ACTIVE',
      userName: 'Admin', userPhone: '+91900001', userProfilePhotoUrl: null,
      userIsStub: false, userCreatedAt: new Date().toISOString(),
    })
    expect(m.clubId).toBe(clubId)
    expect(m.role).toBe('ADMIN')

    const found = await db.memberships.get(clubId, userId1)
    expect(found).not.toBeNull()
    expect(found!.role).toBe('ADMIN')
  })

  it('lists memberships by club', async () => {
    await db.memberships.create({
      clubId, userId: userId2, role: 'MEMBER', status: 'ACTIVE',
      userName: 'Member', userPhone: '+91900002', userProfilePhotoUrl: null,
      userIsStub: false, userCreatedAt: new Date().toISOString(),
    })

    const { items } = await db.memberships.listByClub(clubId)
    expect(items.length).toBeGreaterThanOrEqual(2)
  })

  it('lists memberships by user', async () => {
    const memberships = await db.memberships.listByUser(userId1)
    expect(memberships.length).toBeGreaterThanOrEqual(1)
    expect(memberships[0].clubId).toBe(clubId)
  })

  it('filters by status', async () => {
    await db.memberships.create({
      clubId, userId: 'user-suspended', role: 'MEMBER', status: 'SUSPENDED',
      userName: 'Suspended', userPhone: '+91900003', userProfilePhotoUrl: null,
      userIsStub: false, userCreatedAt: new Date().toISOString(),
    })

    const { items } = await db.memberships.listByClub(clubId, { status: 'ACTIVE' })
    expect(items.every(m => m.status === 'ACTIVE')).toBe(true)
  })

  it('searches by name', async () => {
    const { items } = await db.memberships.listByClub(clubId, { search: 'Admin' })
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].userName).toBe('Admin')
  })

  it('updates role and status', async () => {
    const updated = await db.memberships.update(clubId, userId2, { role: 'ADMIN' })
    expect(updated!.role).toBe('ADMIN')

    const updated2 = await db.memberships.update(clubId, userId2, { status: 'LEFT' })
    expect(updated2!.status).toBe('LEFT')
  })

  it('lists admins', async () => {
    const admins = await db.memberships.listAdminsByClub(clubId)
    expect(admins.length).toBeGreaterThanOrEqual(1)
    expect(admins.every(a => a.role === 'ADMIN' && a.status === 'ACTIVE')).toBe(true)
  })
})
