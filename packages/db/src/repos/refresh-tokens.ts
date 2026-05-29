import { PutCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { RefreshToken } from '../types'

function toToken(item: Record<string, unknown>): RefreshToken {
  return {
    id: item.id as string,
    userId: item.userId as string,
    token: item.token as string,
    expiresAt: item.expiresAt as string,
    createdAt: item.createdAt as string,
  }
}

export const refreshTokens = {
  async create(data: { userId: string; token: string; expiresAt: Date }): Promise<RefreshToken> {
    const id = generateId()
    const item = {
      PK: `USER#${data.userId}`, SK: `RTOKEN#${id}`,
      GSI1PK: `TOKEN#${data.token}`, GSI1SK: 'RTOKEN',
      entityType: 'RefreshToken',
      id, userId: data.userId, token: data.token,
      expiresAt: data.expiresAt.toISOString(),
      createdAt: now(),
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toToken(item)
  },

  async findByToken(token: string): Promise<RefreshToken | null> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': `TOKEN#${token}`, ':sk': 'RTOKEN' },
      Limit: 1,
    }))
    return res.Items?.[0] ? toToken(res.Items[0]) : null
  },

  async deleteByUserId(userId: string): Promise<void> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'RTOKEN#' },
      ProjectionExpression: 'PK, SK',
    }))
    if (!res.Items?.length) return
    const batches = chunk(res.Items, 25)
    for (const batch of batches) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [getTableName()]: batch.map(item => ({
            DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
          })),
        },
      }))
    }
  },
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}
