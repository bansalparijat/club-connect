import { describe, it, expect } from 'vitest'
import { db } from '@club-connect/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'
import { verifyAccessToken } from '@/lib/jwt'

describe('Auth Flow (integration)', () => {
  it('creates a new user on first OTP verify', async () => {
    const user = await db.users.create({ phone: '+919100000001', name: '', isStub: false })
    expect(user.name).toBe('')

    const token = await signAccessToken(user.id)
    const payload = await verifyAccessToken(token)
    expect(payload.sub).toBe(user.id)
  })

  it('stores and retrieves refresh token', async () => {
    const user = await db.users.create({ phone: '+919100000002', name: '', isStub: false })
    const refreshToken = await signRefreshToken(user.id)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await db.refreshTokens.create({ userId: user.id, token: refreshToken, expiresAt })

    const stored = await db.refreshTokens.findByToken(refreshToken)
    expect(stored).not.toBeNull()
    expect(stored!.userId).toBe(user.id)
  })

  it('finds existing user by phone on re-login', async () => {
    const phone = '+919100000003'
    await db.users.create({ phone, name: 'Existing', isStub: false })

    const found = await db.users.findByPhone(phone)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('Existing')
  })

  it('activates a stub user on OTP verify', async () => {
    const user = await db.users.create({ phone: '+919100000004', name: 'Stub', isStub: true })
    expect(user.isStub).toBe(true)

    // After OTP verify + profile setup
    const updated = await db.users.update(user.id, { name: 'Real Name', isStub: false })
    expect(updated!.isStub).toBe(false)
    expect(updated!.name).toBe('Real Name')
  })
})
