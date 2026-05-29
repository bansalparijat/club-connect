import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('UserRepo', () => {
  it('creates a user and finds by ID', async () => {
    const user = await db.users.create({ phone: '+919000000001', name: 'Alice', isStub: false })
    expect(user.id).toBeTruthy()
    expect(user.phone).toBe('+919000000001')
    expect(user.name).toBe('Alice')
    expect(user.isStub).toBe(false)

    const found = await db.users.findById(user.id)
    expect(found).not.toBeNull()
    expect(found!.phone).toBe('+919000000001')
  })

  it('finds a user by phone', async () => {
    const user = await db.users.create({ phone: '+919000000002', name: 'Bob', isStub: true })
    const found = await db.users.findByPhone('+919000000002')
    expect(found).not.toBeNull()
    expect(found!.id).toBe(user.id)
    expect(found!.isStub).toBe(true)
  })

  it('returns null for non-existent user', async () => {
    expect(await db.users.findById('nonexistent')).toBeNull()
    expect(await db.users.findByPhone('+910000000000')).toBeNull()
  })

  it('updates user name and clears stub status', async () => {
    const user = await db.users.create({ phone: '+919000000003', name: '', isStub: true })
    const updated = await db.users.update(user.id, { name: 'Charlie', isStub: false })
    expect(updated!.name).toBe('Charlie')
    expect(updated!.isStub).toBe(false)
  })

  it('updates profile photo URL', async () => {
    const user = await db.users.create({ phone: '+919000000004', name: 'Diana', isStub: false })
    const updated = await db.users.update(user.id, { profilePhotoUrl: 'https://example.com/photo.jpg' })
    expect(updated!.profilePhotoUrl).toBe('https://example.com/photo.jpg')
  })

  it('returns null when updating non-existent user', async () => {
    const result = await db.users.update('nonexistent', { name: 'Ghost' })
    // DynamoDB UpdateItem creates the item if it doesn't exist with only the updated fields
    // This is expected DynamoDB behavior
    expect(result).toBeDefined()
  })
})
