import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { now } from '../utils'
import type { MatchFeePayment } from '../types'

function toFee(item: Record<string, unknown>): MatchFeePayment {
  return {
    matchId: item.matchId as string,
    userId: item.userId as string,
    markedPaid: (item.markedPaid as boolean) ?? false,
    markedAt: (item.markedAt as string) ?? null,
    createdAt: item.createdAt as string,
  }
}

export const feePayments = {
  async get(matchId: string, userId: string): Promise<MatchFeePayment | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `FEE#${userId}` },
    }))
    return res.Item ? toFee(res.Item) : null
  },

  async listByMatch(matchId: string): Promise<MatchFeePayment[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'FEE#' },
    }))
    return (res.Items ?? []).map(toFee)
  },

  async listByUserAcrossMatches(userId: string, matchIds: string[]): Promise<MatchFeePayment[]> {
    if (matchIds.length === 0) return []
    const results: MatchFeePayment[] = []
    for (const matchId of matchIds) {
      const f = await this.get(matchId, userId)
      if (f) results.push(f)
    }
    return results
  },

  async create(matchId: string, userId: string): Promise<MatchFeePayment> {
    const ts = now()
    const item = {
      PK: `MATCH#${matchId}`, SK: `FEE#${userId}`,
      entityType: 'MatchFeePayment',
      matchId, userId, markedPaid: false, markedAt: null, createdAt: ts,
    }
    // Conditional put — don't overwrite existing
    try {
      await docClient.send(new PutCommand({
        TableName: getTableName(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }))
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Already exists, return existing
        return (await this.get(matchId, userId))!
      }
      throw e
    }
    return toFee(item)
  },

  async markPaid(matchId: string, userId: string): Promise<MatchFeePayment | null> {
    const ts = now()
    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `FEE#${userId}` },
      UpdateExpression: 'SET markedPaid = :paid, markedAt = :at',
      ExpressionAttributeValues: { ':paid': true, ':at': ts },
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toFee(res.Attributes) : null
  },

  async deleteForUser(matchId: string, userId: string): Promise<void> {
    await docClient.send(new DeleteCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `FEE#${userId}` },
    }))
  },
}
