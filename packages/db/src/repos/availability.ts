import { GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { now, padPosition } from '../utils'
import type { MatchAvailability } from '../types'

function toAvail(item: Record<string, unknown>): MatchAvailability {
  return {
    matchId: item.matchId as string,
    userId: item.userId as string,
    status: item.status as MatchAvailability['status'],
    position: (item.position as number) ?? null,
    respondedAt: item.respondedAt as string,
    updatedAt: item.updatedAt as string,
    userName: (item.userName as string) ?? '',
    userPhone: (item.userPhone as string) ?? '',
    userProfilePhotoUrl: (item.userProfilePhotoUrl as string) ?? null,
    userIsStub: (item.userIsStub as boolean) ?? false,
    userCreatedAt: (item.userCreatedAt as string) ?? '',
  }
}

export const availability = {
  async get(matchId: string, userId: string): Promise<MatchAvailability | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `AVAIL#${userId}` },
    }))
    return res.Item ? toAvail(res.Item) : null
  },

  async listByMatch(matchId: string): Promise<MatchAvailability[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'AVAIL#' },
    }))
    return (res.Items ?? []).map(toAvail)
  },

  async listByMatchAndStatus(matchId: string, status: string): Promise<MatchAvailability[]> {
    const all = await this.listByMatch(matchId)
    return all.filter(a => a.status === status)
  },

  async listByUserAcrossMatches(userId: string, matchIds: string[]): Promise<MatchAvailability[]> {
    if (matchIds.length === 0) return []
    const results: MatchAvailability[] = []
    // Batch get individual items
    for (const matchId of matchIds) {
      const a = await this.get(matchId, userId)
      if (a) results.push(a)
    }
    return results
  },

  async countByStatus(matchId: string, status: string): Promise<number> {
    const items = await this.listByMatchAndStatus(matchId, status)
    return items.length
  },

  async upsert(matchId: string, userId: string, data: {
    status: MatchAvailability['status']; position: number | null;
    userName: string; userPhone: string; userProfilePhotoUrl: string | null;
    userIsStub: boolean; userCreatedAt: string;
  }): Promise<MatchAvailability> {
    const ts = now()
    const item = {
      PK: `MATCH#${matchId}`, SK: `AVAIL#${userId}`,
      GSI1PK: `USER#${userId}`, GSI1SK: `MATCH_AVAIL#${matchId}`,
      GSI2PK: `MATCH_STATUS#${matchId}#${data.status}`,
      GSI2SK: data.position != null ? `POS#${padPosition(data.position)}#${userId}` : `POS#99999#${userId}`,
      entityType: 'MatchAvailability',
      matchId, userId,
      status: data.status, position: data.position,
      respondedAt: ts, updatedAt: ts,
      userName: data.userName, userPhone: data.userPhone,
      userProfilePhotoUrl: data.userProfilePhotoUrl,
      userIsStub: data.userIsStub, userCreatedAt: data.userCreatedAt,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toAvail(item)
  },

  async updateStatus(matchId: string, userId: string, data: {
    status: MatchAvailability['status']; position: number | null
  }): Promise<MatchAvailability | null> {
    const ts = now()
    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: `AVAIL#${userId}` },
      UpdateExpression: 'SET #status = :status, #pos = :pos, #updatedAt = :ts, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
      ExpressionAttributeNames: { '#status': 'status', '#pos': 'position', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: {
        ':status': data.status,
        ':pos': data.position,
        ':ts': ts,
        ':gsi2pk': `MATCH_STATUS#${matchId}#${data.status}`,
        ':gsi2sk': data.position != null ? `POS#${padPosition(data.position)}#${userId}` : `POS#99999#${userId}`,
      },
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toAvail(res.Attributes) : null
  },

  /** Create multiple UNAVAILABLE records (for auto-marking on match creation) */
  async createManyUnavailable(matchId: string, users: {
    userId: string; userName: string; userPhone: string;
    userProfilePhotoUrl: string | null; userIsStub: boolean; userCreatedAt: string;
  }[]): Promise<void> {
    if (users.length === 0) return
    const ts = now()
    const table = getTableName()
    const items = users.map(u => ({
      PutRequest: {
        Item: {
          PK: `MATCH#${matchId}`, SK: `AVAIL#${u.userId}`,
          GSI1PK: `USER#${u.userId}`, GSI1SK: `MATCH_AVAIL#${matchId}`,
          GSI2PK: `MATCH_STATUS#${matchId}#UNAVAILABLE`,
          GSI2SK: `POS#99999#${u.userId}`,
          entityType: 'MatchAvailability',
          matchId, userId: u.userId,
          status: 'UNAVAILABLE', position: null,
          respondedAt: ts, updatedAt: ts,
          userName: u.userName, userPhone: u.userPhone,
          userProfilePhotoUrl: u.userProfilePhotoUrl,
          userIsStub: u.userIsStub, userCreatedAt: u.userCreatedAt,
        },
      },
    }))

    const batches = chunk(items, 25)
    for (const batch of batches) {
      await docClient.send(new BatchWriteCommand({ RequestItems: { [table]: batch } }))
    }
  },

  /** Shift waitlist positions down by 1 for all positions > given position */
  async shiftPositionsDown(matchId: string, abovePosition: number): Promise<void> {
    const waitlisted = await this.listByMatchAndStatus(matchId, 'WAITLISTED')
    const toShift = waitlisted.filter(a => a.position !== null && a.position > abovePosition)
    for (const a of toShift) {
      await this.updateStatus(matchId, a.userId, {
        status: 'WAITLISTED',
        position: a.position! - 1,
      })
    }
  },

  /** Get next waitlisted player (position 1) */
  async getNextWaitlisted(matchId: string): Promise<MatchAvailability | null> {
    const waitlisted = await this.listByMatchAndStatus(matchId, 'WAITLISTED')
    const sorted = waitlisted
      .filter(a => a.position !== null)
      .sort((a, b) => a.position! - b.position!)
    return sorted[0] ?? null
  },
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}
