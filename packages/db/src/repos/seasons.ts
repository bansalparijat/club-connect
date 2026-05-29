import { PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { Season } from '../types'

function toSeason(item: Record<string, unknown>): Season {
  return {
    id: item.id as string,
    clubId: item.clubId as string,
    name: item.name as string,
    startDate: item.startDate as string,
    endDate: (item.endDate as string) ?? null,
    isActive: (item.isActive as boolean) ?? false,
    isEnded: (item.isEnded as boolean) ?? false,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  }
}

export const seasons = {
  async findById(clubId: string, seasonId: string): Promise<Season | null> {
    const all = await this.listByClub(clubId)
    return all.find(s => s.id === seasonId) ?? null
  },

  async listByClub(clubId: string): Promise<Season[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `CLUB#${clubId}`, ':sk': 'SEASON#' },
    }))
    return (res.Items ?? []).map(toSeason).sort((a, b) =>
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    )
  },

  async findActive(clubId: string): Promise<Season | null> {
    const all = await this.listByClub(clubId)
    return all.find(s => s.isActive) ?? null
  },

  async create(data: { clubId: string; name: string; startDate: string; endDate?: string }): Promise<Season> {
    const id = generateId()
    const ts = now()
    const item = {
      PK: `CLUB#${data.clubId}`, SK: `SEASON#${id}`,
      entityType: 'Season',
      id, clubId: data.clubId, name: data.name,
      startDate: data.startDate, endDate: data.endDate ?? null,
      isActive: false, isEnded: false,
      createdAt: ts, updatedAt: ts,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toSeason(item)
  },

  async update(clubId: string, seasonId: string, data: {
    name?: string; startDate?: string; endDate?: string | null;
    isActive?: boolean; isEnded?: boolean
  }): Promise<Season | null> {
    const sets: string[] = ['#updatedAt = :updatedAt']
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
    const values: Record<string, unknown> = { ':updatedAt': now() }

    if (data.name !== undefined) {
      sets.push('#name = :name')
      names['#name'] = 'name'
      values[':name'] = data.name
    }
    if (data.startDate !== undefined) {
      sets.push('startDate = :startDate')
      values[':startDate'] = data.startDate
    }
    if (data.endDate !== undefined) {
      sets.push('endDate = :endDate')
      values[':endDate'] = data.endDate
    }
    if (data.isActive !== undefined) {
      sets.push('isActive = :isActive')
      values[':isActive'] = data.isActive
    }
    if (data.isEnded !== undefined) {
      sets.push('isEnded = :isEnded')
      values[':isEnded'] = data.isEnded
    }

    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${clubId}`, SK: `SEASON#${seasonId}` },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toSeason(res.Attributes) : null
  },

  /** Sync isActive status for all seasons in a club based on current date */
  async syncStatuses(clubId: string): Promise<void> {
    const all = await this.listByClub(clubId)
    const currentTime = new Date()

    for (const s of all) {
      const shouldBeActive =
        !s.isEnded &&
        new Date(s.startDate) <= currentTime &&
        (s.endDate === null || new Date(s.endDate) > currentTime)

      if (shouldBeActive !== s.isActive) {
        await this.update(clubId, s.id, { isActive: shouldBeActive })
      }
    }
  },

  /** Deactivate all seasons except the given one */
  async deactivateOthers(clubId: string, exceptSeasonId: string): Promise<void> {
    const all = await this.listByClub(clubId)
    for (const s of all) {
      if (s.id !== exceptSeasonId && s.isActive) {
        await this.update(clubId, s.id, { isActive: false })
      }
    }
  },
}
