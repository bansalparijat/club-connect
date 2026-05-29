import { NextRequest } from 'next/server'
import { z } from 'zod'
import { verifyRefreshToken, signAccessToken } from '@/lib/jwt'
import { db } from '@club-connect/db'
import { ok, err } from '@/lib/response'

const schema = z.object({ refreshToken: z.string() })

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Missing refreshToken')

  try {
    const payload = await verifyRefreshToken(parsed.data.refreshToken)

    const stored = await db.refreshTokens.findByToken(parsed.data.refreshToken)

    if (!stored || stored.userId !== payload.sub || new Date(stored.expiresAt) < new Date()) {
      return err.unauthorized('Invalid or expired refresh token')
    }

    const accessToken = await signAccessToken(payload.sub)
    return ok({ accessToken })
  } catch {
    return err.unauthorized('Invalid refresh token')
  }
}
