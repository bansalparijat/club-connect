import { GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import type { MatchCaptain } from '../types'

function toCaptain(item: Record<string, unknown>): MatchCaptain {
  return { matchId: item.matchId as string, userId: item.userId as string }
}

export const captains = {
  async get(matchId: string, userId: string): Promise<MatchCaptain | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `CAPTAIN#${userId}` },
    }))
    return res.Item ? toCaptain(res.Item) : null
  },

  async listByMatch(matchId: string): Promise<MatchCaptain[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'CAPTAIN#' },
    }))
    return (res.Items ?? []).map(toCaptain)
  },

  async create(matchId: string, userId: string): Promise<MatchCaptain> {
    const item = {
      PK: `MATCH#${matchId}`, SK: `CAPTAIN#${userId}`,
      entityType: 'MatchCaptain',
      matchId, userId,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toCaptain(item)
  },

  async delete(matchId: string, userId: string): Promise<void> {
    await docClient.send(new DeleteCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `CAPTAIN#${userId}` },
    }))
  },
}
