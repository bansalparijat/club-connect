import { describe, it, expect } from 'vitest'
import { db } from '@club-connect/db'

describe('Unavailability Rules (integration)', () => {
  let userId: string
  const clubId = 'club-unavail-test'

  it('creates a user', async () => {
    const u = await db.users.create({ phone: '+919400000001', name: 'Unavail User', isStub: false })
    userId = u.id
  })

  it('creates a specific-date unavailability rule', async () => {
    const rule = await db.unavailability.create({
      userId, clubId, type: 'SPECIFIC_DATE',
      date: '2026-07-15T00:00:00.000Z',
    })
    expect(rule.type).toBe('SPECIFIC_DATE')
    expect(rule.date).toBe('2026-07-15T00:00:00.000Z')
    expect(rule.clubId).toBe(clubId)
  })

  it('creates a recurring weekly unavailability rule', async () => {
    const rule = await db.unavailability.create({
      userId, type: 'RECURRING_WEEKLY',
      dayOfWeek: 0, // Sunday
      startFrom: '2026-06-01T00:00:00.000Z',
      weeksAhead: 8,
    })
    expect(rule.type).toBe('RECURRING_WEEKLY')
    expect(rule.dayOfWeek).toBe(0)
    expect(rule.clubId).toBeNull() // global
  })

  it('lists rules for a user', async () => {
    const rules = await db.unavailability.listByUser(userId)
    expect(rules.length).toBe(2)
  })

  it('lists rules filtered by club (includes global)', async () => {
    const rules = await db.unavailability.listByUser(userId, clubId)
    expect(rules.length).toBe(2) // club-specific + global
  })

  it('finds matching rules for a specific date', async () => {
    const matchDate = new Date('2026-07-15T10:00:00.000Z')
    const matches = await db.unavailability.findMatchingRules(clubId, matchDate, [userId])
    expect(matches.length).toBe(1) // specific date match
  })

  it('finds matching rules for a recurring Sunday', async () => {
    // Find the next Sunday after startFrom
    const sunday = new Date('2026-06-07T10:00:00.000Z') // a Sunday within 8 weeks of June 1
    expect(sunday.getDay()).toBe(0) // confirm it's Sunday
    const matches = await db.unavailability.findMatchingRules(clubId, sunday, [userId])
    expect(matches.length).toBe(1) // recurring weekly match
  })

  it('does not match outside the recurring window', async () => {
    // 10 weeks after June 1 = August 10 — beyond 8 weeks
    const tooLate = new Date('2026-08-16T10:00:00.000Z')
    expect(tooLate.getDay()).toBe(0) // Sunday
    const matches = await db.unavailability.findMatchingRules(clubId, tooLate, [userId])
    expect(matches.length).toBe(0)
  })

  it('deletes a rule', async () => {
    const rules = await db.unavailability.listByUser(userId)
    await db.unavailability.delete(userId, rules[0].id)
    const after = await db.unavailability.listByUser(userId)
    expect(after.length).toBe(1)
  })
})
