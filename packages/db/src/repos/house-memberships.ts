import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId } from '../utils'
import type { HouseMembership } from '../types'

function toHM(item: Record<string, unknown>): HouseMembership {
  return {
    id: item.id as string,
    houseId: item.houseId as string,
    userId: item.userId as string,
    seasonId: item.seasonId as string,
  }
}

export const houseMemberships = {
  async get(seasonId: string, userId: string): Promise<HouseMembership | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `SEASON#${seasonId}`, SK: `HMEMBER#${userId}` },
    }))
    return res.Item ? toHM(res.Item) : null
  },

  async listBySeason(seasonId: string): Promise<HouseMembership[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `SEASON#${seasonId}`, ':sk': 'HMEMBER#' },
    }))
    return (res.Items ?? []).map(toHM)
  },

  async listByUserIds(seasonId: string, userIds: string[]): Promise<HouseMembership[]> {
    if (userIds.length === 0) return []
    const all = await this.listBySeason(seasonId)
    return all.filter(hm => userIds.includes(hm.userId))
  },

  /** Upsert: put replaces any existing assignment for this user+season */
  async upsert(data: { userId: string; seasonId: string; houseId: string }): Promise<HouseMembership> {
    const existing = await this.get(data.seasonId, data.userId)
    const id = existing?.id ?? generateId()
    const item = {
      PK: `SEASON#${data.seasonId}`, SK: `HMEMBER#${data.userId}`,
      GSI1PK: `USER#${data.userId}`, GSI1SK: `HMEMBER#${data.seasonId}`,
      entityType: 'HouseMembership',
      id, houseId: data.houseId, userId: data.userId, seasonId: data.seasonId,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toHM(item)
  },
}
