import { GetCommand, PutCommand, UpdateCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { Match, MatchHouse, MatchParameter } from '../types'

function toMatch(item: Record<string, unknown>): Match {
  return {
    id: item.id as string,
    clubId: item.clubId as string,
    seasonId: (item.seasonId as string) ?? null,
    title: item.title as string,
    date: item.date as string,
    venue: item.venue as string,
    capacity: item.capacity as number,
    waitlistSize: item.waitlistSize as number,
    feeAmount: (item.feeAmount as number) ?? null,
    feeCurrency: (item.feeCurrency as string) ?? null,
    status: item.status as Match['status'],
    createdById: item.createdById as string,
    confirmedCount: (item.confirmedCount as number) ?? 0,
    waitlistedCount: (item.waitlistedCount as number) ?? 0,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  }
}

function toMatchHouse(item: Record<string, unknown>): MatchHouse {
  return { matchId: item.matchId as string, houseId: item.houseId as string }
}

function toMatchParam(item: Record<string, unknown>): MatchParameter {
  return {
    matchId: item.matchId as string,
    key: item.key as string,
    value: item.value as string,
    sportParamId: (item.sportParamId as string) ?? null,
    isCustom: (item.isCustom as boolean) ?? false,
  }
}

export const matches = {
  async findById(matchId: string): Promise<Match | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: '#META' },
    }))
    return res.Item ? toMatch(res.Item) : null
  },

  async create(data: {
    clubId: string; seasonId?: string; title: string; date: string; venue: string;
    capacity: number; waitlistSize: number; feeAmount?: number; feeCurrency?: string;
    createdById: string;
    houseIds: string[];
    parameters: { key: string; value: string; sportParamId?: string; isCustom?: boolean }[];
  }): Promise<Match> {
    const id = generateId()
    const ts = now()
    const table = getTableName()

    const matchItem = {
      PK: `MATCH#${id}`, SK: '#META',
      GSI2PK: `CLUB_MATCHES#${data.clubId}`, GSI2SK: `${data.date}#${id}`,
      entityType: 'Match',
      id, clubId: data.clubId, seasonId: data.seasonId ?? null,
      title: data.title, date: data.date, venue: data.venue,
      capacity: data.capacity, waitlistSize: data.waitlistSize,
      feeAmount: data.feeAmount ?? null, feeCurrency: data.feeCurrency ?? 'INR',
      status: 'OPEN' as const,
      createdById: data.createdById,
      confirmedCount: 0, waitlistedCount: 0,
      createdAt: ts, updatedAt: ts,
    }

    // Write match + houses + params + season link in batch
    const writeItems: { PutRequest: { Item: Record<string, unknown> } }[] = [
      { PutRequest: { Item: matchItem } },
    ]

    for (const houseId of data.houseIds) {
      writeItems.push({
        PutRequest: {
          Item: {
            PK: `MATCH#${id}`, SK: `MHOUSE#${houseId}`,
            entityType: 'MatchHouse',
            matchId: id, houseId,
          },
        },
      })
    }

    for (const p of data.parameters) {
      writeItems.push({
        PutRequest: {
          Item: {
            PK: `MATCH#${id}`, SK: `MPARAM#${p.key}`,
            entityType: 'MatchParameter',
            matchId: id, key: p.key, value: p.value,
            sportParamId: p.sportParamId ?? null, isCustom: p.isCustom ?? false,
          },
        },
      })
    }

    // Season match link for season-based queries
    if (data.seasonId) {
      writeItems.push({
        PutRequest: {
          Item: {
            PK: `SEASON_MATCHES#${data.seasonId}`, SK: `${data.date}#${id}`,
            entityType: 'SeasonMatch',
            matchId: id, seasonId: data.seasonId,
            title: data.title, venue: data.venue, status: 'OPEN',
            date: data.date, clubId: data.clubId,
          },
        },
      })
    }

    // BatchWrite max 25 items per request
    const batches = chunk(writeItems, 25)
    for (const batch of batches) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: { [table]: batch },
      }))
    }

    return toMatch(matchItem)
  },

  async update(matchId: string, data: {
    title?: string; venue?: string; date?: string; capacity?: number;
    waitlistSize?: number; feeAmount?: number | null; status?: Match['status']
  }): Promise<Match | null> {
    const sets: string[] = ['#updatedAt = :updatedAt']
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
    const values: Record<string, unknown> = { ':updatedAt': now() }

    if (data.title !== undefined) { sets.push('title = :title'); values[':title'] = data.title }
    if (data.venue !== undefined) { sets.push('venue = :venue'); values[':venue'] = data.venue }
    if (data.date !== undefined) {
      sets.push('#date = :date')
      names['#date'] = 'date'
      values[':date'] = data.date
    }
    if (data.capacity !== undefined) {
      sets.push('#capacity = :capacity')
      names['#capacity'] = 'capacity'
      values[':capacity'] = data.capacity
    }
    if (data.waitlistSize !== undefined) { sets.push('waitlistSize = :wl'); values[':wl'] = data.waitlistSize }
    if (data.feeAmount !== undefined) { sets.push('feeAmount = :fee'); values[':fee'] = data.feeAmount }
    if (data.status !== undefined) {
      sets.push('#status = :status')
      names['#status'] = 'status'
      values[':status'] = data.status
    }

    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: '#META' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toMatch(res.Attributes) : null
  },

  async listByClub(clubId: string, opts?: {
    status?: string; from?: string; to?: string; seasonId?: string;
    limit?: number; ascending?: boolean
  }): Promise<Match[]> {
    // If seasonId, query the season link items
    if (opts?.seasonId) {
      return this.listBySeason(opts.seasonId)
    }

    const keyExpr = 'GSI2PK = :pk'
    const values: Record<string, unknown> = { ':pk': `CLUB_MATCHES#${clubId}` }

    let rangeExpr = ''
    if (opts?.from && opts?.to) {
      rangeExpr = ' AND GSI2SK BETWEEN :from AND :to'
      values[':from'] = opts.from
      values[':to'] = opts.to + '\uffff'
    } else if (opts?.from) {
      rangeExpr = ' AND GSI2SK >= :from'
      values[':from'] = opts.from
    } else if (opts?.to) {
      rangeExpr = ' AND GSI2SK <= :to'
      values[':to'] = opts.to + '\uffff'
    }

    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI2',
      KeyConditionExpression: keyExpr + rangeExpr,
      ExpressionAttributeValues: values,
      ScanIndexForward: opts?.ascending ?? true,
      Limit: opts?.limit ?? 100,
    }))

    let items = (res.Items ?? []).map(toMatch)
    if (opts?.status) items = items.filter(m => m.status === opts.status)
    else items = items.filter(m => m.status !== 'CANCELLED')
    return items
  },

  async listBySeason(seasonId: string): Promise<Match[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `SEASON_MATCHES#${seasonId}` },
      ScanIndexForward: false, // date desc
    }))

    // Season link items contain matchId; we need to fetch full match data
    const matchIds = (res.Items ?? []).map(i => i.matchId as string)
    const matches: Match[] = []
    for (const mid of matchIds) {
      const m = await this.findById(mid)
      if (m) matches.push(m)
    }
    return matches
  },

  async listHouses(matchId: string): Promise<MatchHouse[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'MHOUSE#' },
    }))
    return (res.Items ?? []).map(toMatchHouse)
  },

  async listParameters(matchId: string): Promise<MatchParameter[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'MPARAM#' },
    }))
    return (res.Items ?? []).map(toMatchParam)
  },

  async incrementCount(matchId: string, field: 'confirmedCount' | 'waitlistedCount', delta: number): Promise<void> {
    await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `MATCH#${matchId}`, SK: '#META' },
      UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :delta`,
      ExpressionAttributeValues: { ':delta': delta, ':zero': 0 },
    }))
  },
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}
