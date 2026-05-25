import { NextRequest } from 'next/server'
import { z } from 'zod'
import { verifyOtp, normalizePhone } from '@/lib/otp'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { ok, err } from '@/lib/response'

const schema = z.object({
  phone: z.string().min(7).max(16),
  otp: z.string().length(6),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid request', parsed.error.flatten().fieldErrors)

  const phone = normalizePhone(parsed.data.phone)
  const valid = await verifyOtp(phone, parsed.data.otp)
  if (!valid) return err.unauthorized('Invalid or expired OTP')

  // Find or create user
  let user = await prisma.user.findUnique({ where: { phone } })
  if (!user) {
    user = await prisma.user.create({
      data: { phone, name: phone, isStub: false },
    })
  } else if (user.isStub) {
    // Stub user is activating — keep isStub=true until they set their name
    // They'll be prompted to complete profile on the mobile side
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id),
    signRefreshToken(user.id),
  ])

  // Store refresh token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt } })

  return ok({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      profilePhotoUrl: user.profilePhotoUrl,
      isStub: user.isStub,
      createdAt: user.createdAt.toISOString(),
    },
  })
}
