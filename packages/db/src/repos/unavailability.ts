import { GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { UserUnavailability } from '../types'

function toRule(item: Record<string, unknown>): UserUnavailability {
  return {
    id: item.id as string,
    userId: item.userId as string,
    clubId: (item.clubId as string) ?? null,
    type: item.type as UserUnavailability['type'],
    date: (item.date as string) ?? null,
    dayOfWeek: (item.dayOfWeek as number) ?? null,
    startFrom: (item.startFrom as string) ?? null,
    weeksAhead: (item.weeksAhead as number) ?? null,
    createdAt: item.createdAt as string,
  }
}

export const unavailability = {
  async listByUser(userId: string, clubId?: string): Promise<UserUnavailability[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'UNAVAIL#' },
    }))
    let items = (res.Items ?? []).map(toRule)
    if (clubId) items = items.filter(r => r.clubId === clubId || r.clubId === null)
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  async findById(id: string, userId: string): Promise<UserUnavailability | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `USER#${userId}`, SK: `UNAVAIL#${id}` },
    }))
    return res.Item ? toRule(res.Item) : null
  },

  async create(data: {
    userId: string; clubId?: string; type: UserUnavailability['type'];
    date?: string; dayOfWeek?: number; startFrom?: string; weeksAhead?: number
  }): Promise<UserUnavailability> {
    const id = generateId()
    const item = {
      PK: `USER#${data.userId}`, SK: `UNAVAIL#${id}`,
      entityType: 'UserUnavailability',
      id, userId: data.userId, clubId: data.clubId ?? null,
      type: data.type,
      date: data.date ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      startFrom: data.startFrom ?? null,
      weeksAhead: data.weeksAhead ?? null,
      createdAt: now(),
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toRule(item)
  },

  async delete(userId: string, ruleId: string): Promise<void> {
    await docClient.send(new DeleteCommand({
      TableName: getTableName(),
      Key: { PK: `USER#${userId}`, SK: `UNAVAIL#${ruleId}` },
    }))
  },

  /**
   * Find users who have unavailability matching a given match date/club.
   * Used when creating a match to auto-mark unavailable members.
   * Scans all unavailability rules — acceptable since this runs once per match creation.
   */
  async findMatchingRules(clubId: string, matchDate: Date, activeUserIds: string[]): Promise<{ userId: string }[]> {
    if (activeUserIds.length === 0) return []

    const dayOfWeek = matchDate.getDay()
    const matchDateStr = matchDate.toISOString().split('T')[0] // YYYY-MM-DD

    // Scan unavailability rules for all active users
    const matched: Set<string> = new Set()

    for (const userId of activeUserIds) {
      const rules = await this.listByUser(userId)
      for (const rule of rules) {
        // Must apply to this club or all clubs
        if (rule.clubId !== null && rule.clubId !== clubId) continue

        if (rule.type === 'SPECIFIC_DATE' && rule.date) {
          const ruleDate = rule.date.split('T')[0]
          if (ruleDate === matchDateStr) {
            matched.add(userId)
            break
          }
        }

        if (rule.type === 'RECURRING_WEEKLY' && rule.dayOfWeek === dayOfWeek && rule.startFrom) {
          const startFrom = new Date(rule.startFrom)
          if (startFrom <= matchDate) {
            if (rule.weeksAhead) {
              const endDate = new Date(startFrom)
              endDate.setDate(endDate.getDate() + rule.weeksAhead * 7)
              if (matchDate <= endDate) { matched.add(userId); break }
            }
          }
        }
      }
    }

    return Array.from(matched).map(userId => ({ userId }))
  },
}
