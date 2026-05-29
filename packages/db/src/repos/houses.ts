import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId } from '../utils'
import type { House } from '../types'

function toHouse(item: Record<string, unknown>): House {
  return {
    id: item.id as string,
    clubId: item.clubId as string,
    name: item.name as string,
    color: (item.color as string) ?? null,
    logoUrl: (item.logoUrl as string) ?? null,
  }
}

export const houses = {
  async findById(clubId: string, houseId: string): Promise<House | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${clubId}`, SK: `HOUSE#${houseId}` },
    }))
    return res.Item ? toHouse(res.Item) : null
  },

  async findByName(clubId: string, name: string): Promise<House | null> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': `CLUB_HOUSE_NAME#${clubId}#${name}`, ':sk': 'HOUSE' },
      Limit: 1,
    }))
    return res.Items?.[0] ? toHouse(res.Items[0]) : null
  },

  async listByClub(clubId: string): Promise<House[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `CLUB#${clubId}`, ':sk': 'HOUSE#' },
    }))
    return (res.Items ?? []).map(toHouse).sort((a, b) => a.name.localeCompare(b.name))
  },

  async findByIds(clubId: string, houseIds: string[]): Promise<House[]> {
    const all = await this.listByClub(clubId)
    return all.filter(h => houseIds.includes(h.id))
  },

  async create(data: { clubId: string; name: string; color?: string; logoUrl?: string }): Promise<House> {
    const id = generateId()
    const item = {
      PK: `CLUB#${data.clubId}`, SK: `HOUSE#${id}`,
      GSI1PK: `CLUB_HOUSE_NAME#${data.clubId}#${data.name}`, GSI1SK: 'HOUSE',
      entityType: 'House',
      id, clubId: data.clubId, name: data.name,
      color: data.color ?? null, logoUrl: data.logoUrl ?? null,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toHouse(item)
  },

  async update(clubId: string, houseId: string, data: { name?: string; color?: string; logoUrl?: string }): Promise<House | null> {
    const sets: string[] = []
    const names: Record<string, string> = {}
    const values: Record<string, unknown> = {}

    if (data.name !== undefined) {
      sets.push('#name = :name')
      names['#name'] = 'name'
      values[':name'] = data.name
      // Update GSI1PK for name uniqueness
      sets.push('GSI1PK = :gsi1pk')
      values[':gsi1pk'] = `CLUB_HOUSE_NAME#${clubId}#${data.name}`
    }
    if (data.color !== undefined) {
      sets.push('color = :color')
      values[':color'] = data.color
    }
    if (data.logoUrl !== undefined) {
      sets.push('logoUrl = :logoUrl')
      values[':logoUrl'] = data.logoUrl
    }

    if (sets.length === 0) return this.findById(clubId, houseId)

    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${clubId}`, SK: `HOUSE#${houseId}` },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toHouse(res.Attributes) : null
  },

  async delete(clubId: string, houseId: string): Promise<void> {
    await docClient.send(new DeleteCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${clubId}`, SK: `HOUSE#${houseId}` },
    }))
  },
}
