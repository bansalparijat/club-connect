import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('ClubRepo', () => {
  it('creates a club and finds by ID', async () => {
    const club = await db.clubs.create({
      name: 'Test Club', sportTypeId: 'sport1',
      description: 'A club', createdById: 'user1',
    })
    expect(club.id).toBeTruthy()
    expect(club.name).toBe('Test Club')
    expect(club.memberCount).toBe(0)

    const found = await db.clubs.findById(club.id)
    expect(found!.name).toBe('Test Club')
  })

  it('returns null for non-existent club', async () => {
    expect(await db.clubs.findById('nope')).toBeNull()
  })

  it('updates club fields', async () => {
    const club = await db.clubs.create({
      name: 'Old Name', sportTypeId: 'sport1', createdById: 'user1',
    })
    const updated = await db.clubs.update(club.id, {
      name: 'New Name', description: 'Updated desc',
    })
    expect(updated!.name).toBe('New Name')
    expect(updated!.description).toBe('Updated desc')
  })

  it('increments and decrements member count', async () => {
    const club = await db.clubs.create({
      name: 'Counter Club', sportTypeId: 'sport1', createdById: 'user1',
    })
    await db.clubs.incrementMemberCount(club.id, 1)
    await db.clubs.incrementMemberCount(club.id, 1)
    await db.clubs.incrementMemberCount(club.id, 1)

    let found = await db.clubs.findById(club.id)
    expect(found!.memberCount).toBe(3)

    await db.clubs.incrementMemberCount(club.id, -1)
    found = await db.clubs.findById(club.id)
    expect(found!.memberCount).toBe(2)
  })
})
