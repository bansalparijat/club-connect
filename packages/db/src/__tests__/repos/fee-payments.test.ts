import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('FeePaymentRepo', () => {
  const matchId = 'match-fee-test'

  it('creates a fee payment record', async () => {
    const fee = await db.feePayments.create(matchId, 'user1')
    expect(fee.matchId).toBe(matchId)
    expect(fee.userId).toBe('user1')
    expect(fee.markedPaid).toBe(false)
    expect(fee.markedAt).toBeNull()
  })

  it('does not overwrite existing fee (idempotent create)', async () => {
    const fee2 = await db.feePayments.create(matchId, 'user1')
    expect(fee2.markedPaid).toBe(false) // still the original
  })

  it('gets fee payment', async () => {
    const fee = await db.feePayments.get(matchId, 'user1')
    expect(fee).not.toBeNull()
    expect(fee!.markedPaid).toBe(false)
  })

  it('marks fee as paid', async () => {
    const updated = await db.feePayments.markPaid(matchId, 'user1')
    expect(updated!.markedPaid).toBe(true)
    expect(updated!.markedAt).toBeTruthy()
  })

  it('lists fees by match', async () => {
    await db.feePayments.create(matchId, 'user2')
    const fees = await db.feePayments.listByMatch(matchId)
    expect(fees.length).toBe(2)
    expect(fees.find(f => f.userId === 'user1')!.markedPaid).toBe(true)
    expect(fees.find(f => f.userId === 'user2')!.markedPaid).toBe(false)
  })

  it('deletes fee for user', async () => {
    await db.feePayments.deleteForUser(matchId, 'user2')
    const fee = await db.feePayments.get(matchId, 'user2')
    expect(fee).toBeNull()
  })
})
