import { describe, it, expect } from 'vitest'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '@/lib/jwt'

describe('JWT', () => {
  const userId = 'test-user-123'

  it('signs and verifies an access token', async () => {
    const token = await signAccessToken(userId)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')

    const payload = await verifyAccessToken(token)
    expect(payload.sub).toBe(userId)
  })

  it('signs and verifies a refresh token', async () => {
    const token = await signRefreshToken(userId)
    const payload = await verifyRefreshToken(token)
    expect(payload.sub).toBe(userId)
  })

  it('rejects an invalid access token', async () => {
    await expect(verifyAccessToken('invalid.token.here')).rejects.toThrow()
  })

  it('rejects a refresh token verified as access token', async () => {
    const refreshToken = await signRefreshToken(userId)
    // Refresh token is signed with a different secret, should fail access verification
    await expect(verifyAccessToken(refreshToken)).rejects.toThrow()
  })

  it('rejects an access token verified as refresh token', async () => {
    const accessToken = await signAccessToken(userId)
    await expect(verifyRefreshToken(accessToken)).rejects.toThrow()
  })
})
