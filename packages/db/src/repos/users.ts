import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { User } from '../types'

function toUser(item: Record<string, unknown>): User {
  return {
    id: item.id as string,
    phone: item.phone as string,
    name: item.name as string,
    profilePhotoUrl: (item.profilePhotoUrl as string) ?? null,
    isStub: (item.isStub as boolean) ?? false,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  }
}

export const users = {
  async findById(id: string): Promise<User | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `USER#${id}`, SK: '#META' },
    }))
    return res.Item ? toUser(res.Item) : null
  },

  async findByPhone(phone: string): Promise<User | null> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': `PHONE#${phone}`, ':sk': 'USER' },
      Limit: 1,
    }))
    return res.Items?.[0] ? toUser(res.Items[0]) : null
  },

  async create(data: { phone: string; name: string; isStub: boolean }): Promise<User> {
    const id = generateId()
    const ts = now()
    const item = {
      PK: `USER#${id}`, SK: '#META',
      GSI1PK: `PHONE#${data.phone}`, GSI1SK: 'USER',
      entityType: 'User',
      id, phone: data.phone, name: data.name,
      profilePhotoUrl: null, isStub: data.isStub,
      createdAt: ts, updatedAt: ts,
    }
    await docClient.send(new PutCommand({
      TableName: getTableName(),
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)',
    }))
    return toUser(item)
  },

  async update(id: string, data: { name?: string; profilePhotoUrl?: string; isStub?: boolean }): Promise<User | null> {
    const sets: string[] = ['#updatedAt = :updatedAt']
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
    const values: Record<string, unknown> = { ':updatedAt': now() }

    if (data.name !== undefined) {
      sets.push('#name = :name')
      names['#name'] = 'name'
      values[':name'] = data.name
    }
    if (data.profilePhotoUrl !== undefined) {
      sets.push('profilePhotoUrl = :photoUrl')
      values[':photoUrl'] = data.profilePhotoUrl
    }
    if (data.isStub !== undefined) {
      sets.push('isStub = :isStub')
      values[':isStub'] = data.isStub
    }

    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `USER#${id}`, SK: '#META' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toUser(res.Attributes) : null
  },
}
