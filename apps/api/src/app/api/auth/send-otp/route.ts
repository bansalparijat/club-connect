import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sendOtp, normalizePhone } from '@/lib/otp'
import { ok, err } from '@/lib/response'

const schema = z.object({
  phone: z.string().min(7).max(16),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return err.badRequest('Invalid JSON') }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err.badRequest('Invalid phone number', parsed.error.flatten().fieldErrors)

  const phone = normalizePhone(parsed.data.phone)

  try {
    await sendOtp(phone)
    return ok({ message: 'OTP sent', expiresIn: 300 })
  } catch (e) {
    console.error('[send-otp]', e)
    return err.internal('Failed to send OTP')
  }
}
