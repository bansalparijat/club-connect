import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId } from '../utils'
import type { SportType, SportParameter } from '../types'

function toSportType(item: Record<string, unknown>): SportType {
  return { id: item.id as string, name: item.name as string }
}

function toSportParam(item: Record<string, unknown>): SportParameter {
  return {
    id: item.id as string,
    sportTypeId: item.sportTypeId as string,
    name: item.name as string,
    type: item.type as SportParameter['type'],
    options: (item.options as string[]) ?? null,
    isRequired: (item.isRequired as boolean) ?? false,
    displayOrder: (item.displayOrder as number) ?? 0,
  }
}

export const sportTypes = {
  async list(): Promise<SportType[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': 'SPORT', ':sk': 'TYPE#' },
    }))
    return (res.Items ?? []).map(toSportType).sort((a, b) => a.name.localeCompare(b.name))
  },

  async findById(id: string): Promise<SportType | null> {
    const all = await this.list()
    return all.find(s => s.id === id) ?? null
  },

  async findByName(name: string): Promise<SportType | null> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': `SPORT_NAME#${name}`, ':sk': 'TYPE' },
      Limit: 1,
    }))
    return res.Items?.[0] ? toSportType(res.Items[0]) : null
  },

  async create(data: { name: string }): Promise<SportType> {
    const id = generateId()
    const item = {
      PK: 'SPORT', SK: `TYPE#${id}`,
      GSI1PK: `SPORT_NAME#${data.name}`, GSI1SK: 'TYPE',
      entityType: 'SportType',
      id, name: data.name,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toSportType(item)
  },

  async listParameters(sportTypeId: string): Promise<SportParameter[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `SPORT#${sportTypeId}`, ':sk': 'SPARAM#' },
    }))
    return (res.Items ?? []).map(toSportParam).sort((a, b) => a.displayOrder - b.displayOrder)
  },

  async createParameter(data: {
    sportTypeId: string; name: string; type: SportParameter['type'];
    options: string[] | null; isRequired: boolean; displayOrder: number
  }): Promise<SportParameter> {
    const id = generateId()
    const item = {
      PK: `SPORT#${data.sportTypeId}`, SK: `SPARAM#${id}`,
      entityType: 'SportParameter',
      id, sportTypeId: data.sportTypeId, name: data.name,
      type: data.type, options: data.options,
      isRequired: data.isRequired, displayOrder: data.displayOrder,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toSportParam(item)
  },

  /** List sport types with their parameters (for API response) */
  async listWithParameters(): Promise<(SportType & { parameters: SportParameter[] })[]> {
    const types = await this.list()
    const result: (SportType & { parameters: SportParameter[] })[] = []
    for (const t of types) {
      const parameters = await this.listParameters(t.id)
      result.push({ ...t, parameters })
    }
    return result
  },
}
