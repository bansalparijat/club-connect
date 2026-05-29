import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { Club } from '../types'

function toClub(item: Record<string, unknown>): Club {
  return {
    id: item.id as string,
    name: item.name as string,
    description: (item.description as string) ?? null,
    logoUrl: (item.logoUrl as string) ?? null,
    sportTypeId: item.sportTypeId as string,
    createdById: item.createdById as string,
    memberCount: (item.memberCount as number) ?? 0,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  }
}

export const clubs = {
  async findById(id: string): Promise<Club | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${id}`, SK: '#META' },
    }))
    return res.Item ? toClub(res.Item) : null
  },

  async create(data: {
    name: string; sportTypeId: string; description?: string; logoUrl?: string; createdById: string
  }): Promise<Club> {
    const id = generateId()
    const ts = now()
    const item = {
      PK: `CLUB#${id}`, SK: '#META',
      entityType: 'Club',
      id, name: data.name, sportTypeId: data.sportTypeId,
      description: data.description ?? null,
      logoUrl: data.logoUrl ?? null,
      createdById: data.createdById,
      memberCount: 0,
      createdAt: ts, updatedAt: ts,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toClub(item)
  },

  async update(id: string, data: { name?: string; description?: string; logoUrl?: string }): Promise<Club | null> {
    const sets: string[] = ['#updatedAt = :updatedAt']
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
    const values: Record<string, unknown> = { ':updatedAt': now() }

    if (data.name !== undefined) {
      sets.push('#name = :name')
      names['#name'] = 'name'
      values[':name'] = data.name
    }
    if (data.description !== undefined) {
      sets.push('description = :desc')
      values[':desc'] = data.description
    }
    if (data.logoUrl !== undefined) {
      sets.push('logoUrl = :logo')
      values[':logo'] = data.logoUrl
    }

    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${id}`, SK: '#META' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toClub(res.Attributes) : null
  },

  async incrementMemberCount(id: string, delta: number): Promise<void> {
    await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${id}`, SK: '#META' },
      UpdateExpression: 'SET memberCount = if_not_exists(memberCount, :zero) + :delta',
      ExpressionAttributeValues: { ':delta': delta, ':zero': 0 },
    }))
  },
}
