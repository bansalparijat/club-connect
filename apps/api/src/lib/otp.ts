// OTP service abstraction — Twilio Verify in production, mock in development

export async function sendOtp(phone: string): Promise<void> {
  if (process.env.NODE_ENV === 'development' && !process.env.TWILIO_VERIFY_SERVICE_SID) {
    // Dev mock: OTP is always "123456"
    console.log(`[OTP Mock] OTP for ${phone}: 123456`)
    return
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
    }
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to send OTP: ${error}`)
  }
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development' && !process.env.TWILIO_VERIFY_SERVICE_SID) {
    // Dev mock: always accept "123456"
    return otp === '123456'
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: otp }).toString(),
    }
  )

  if (!res.ok) return false
  const data = (await res.json()) as { status: string }
  return data.status === 'approved'
}

export function normalizePhone(phone: string): string {
  // Ensure E.164 format
  const cleaned = phone.replace(/\s+/g, '')
  if (cleaned.startsWith('+')) return cleaned
  // Default to India (+91) if no country code
  return `+91${cleaned}`
}
