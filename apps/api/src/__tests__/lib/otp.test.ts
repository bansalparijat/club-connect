import { describe, it, expect } from 'vitest'
import { normalizePhone, verifyOtp, sendOtp } from '@/lib/otp'

describe('OTP', () => {
  describe('normalizePhone', () => {
    it('returns phone with + prefix as-is', () => {
      expect(normalizePhone('+919876543210')).toBe('+919876543210')
    })

    it('adds +91 prefix when missing country code', () => {
      expect(normalizePhone('9876543210')).toBe('+919876543210')
    })

    it('strips whitespace', () => {
      expect(normalizePhone('+91 98765 43210')).toBe('+919876543210')
    })
  })

  describe('dev mock mode', () => {
    it('sendOtp succeeds in dev mode', async () => {
      await expect(sendOtp('+919999900001')).resolves.not.toThrow()
    })

    it('verifyOtp accepts 123456 in dev mode', async () => {
      const result = await verifyOtp('+919999900001', '123456')
      expect(result).toBe(true)
    })

    it('verifyOtp rejects wrong OTP in dev mode', async () => {
      const result = await verifyOtp('+919999900001', '000000')
      expect(result).toBe(false)
    })
  })
})
