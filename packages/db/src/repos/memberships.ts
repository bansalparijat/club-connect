import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { now } from '../utils'
import type { ClubMembership } from '../types'

function toMembership(item: Record<string, unknown>): ClubMembership {
  return {
    clubId: item.clubId as string,
    userId: item.userId as string,
    role: item.role as ClubMembership['role'],
    status: item.status as ClubMembership['status'],
    notificationsEnabled: (item.notificationsEnabled as boolean) ?? true,
    joinedAt: item.joinedAt as string,
    updatedAt: item.updatedAt as string,
    userName: (item.userName as string) ?? '',
    userPhone: (item.userPhone as string) ?? '',
    userProfilePhotoUrl: (item.userProfilePhotoUrl as string) ?? null,
    userIsStub: (item.userIsStub as boolean) ?? false,
    userCreatedAt: (item.userCreatedAt as string) ?? '',
  }
}

export const memberships = {
  async get(clubId: string, userId: string): Promise<ClubMembership | null> {
    const res = await docClient.send(new GetCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${clubId}`, SK: `MEMBER#${userId}` },
    }))
    return res.Item ? toMembership(res.Item) : null
  },

  async listByClub(clubId: string, opts?: {
    status?: string; role?: string; search?: string; limit?: number; lastKey?: Record<string, unknown>
  }): Promise<{ items: ClubMembership[]; lastKey?: Record<string, unknown> }> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `CLUB#${clubId}`, ':sk': 'MEMBER#' },
      ...(opts?.lastKey ? { ExclusiveStartKey: opts.lastKey } : {}),
    }))

    let items = (res.Items ?? []).map(toMembership)

    if (opts?.status) items = items.filter(m => m.status === opts.status)
    if (opts?.role) items = items.filter(m => m.role === opts.role)
    if (opts?.search) {
      const s = opts.search.toLowerCase()
      items = items.filter(m =>
        m.userName.toLowerCase().includes(s) || m.userPhone.includes(s)
      )
    }

    return { items, lastKey: res.LastEvaluatedKey }
  },

  async listByUser(userId: string): Promise<ClubMembership[]> {
    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CLUB_MEMBER#' },
    }))
    return (res.Items ?? []).map(toMembership)
  },

  async listAdminsByClub(clubId: string): Promise<ClubMembership[]> {
    const { items } = await this.listByClub(clubId)
    return items.filter(m => m.role === 'ADMIN' && m.status === 'ACTIVE')
  },

  async countActiveByClub(clubId: string): Promise<number> {
    const { items } = await this.listByClub(clubId, { status: 'ACTIVE' })
    return items.length
  },

  async create(data: {
    clubId: string; userId: string; role: ClubMembership['role'];
    status: ClubMembership['status'];
    userName: string; userPhone: string; userProfilePhotoUrl: string | null;
    userIsStub: boolean; userCreatedAt: string;
  }): Promise<ClubMembership> {
    const ts = now()
    const item = {
      PK: `CLUB#${data.clubId}`, SK: `MEMBER#${data.userId}`,
      GSI1PK: `USER#${data.userId}`, GSI1SK: `CLUB_MEMBER#${data.clubId}`,
      GSI2PK: `CLUB#${data.clubId}#ROLE#${data.role}`,
      GSI2SK: `STATUS#${data.status}#${data.userId}`,
      entityType: 'ClubMembership',
      clubId: data.clubId, userId: data.userId,
      role: data.role, status: data.status,
      notificationsEnabled: true,
      joinedAt: ts, updatedAt: ts,
      userName: data.userName, userPhone: data.userPhone,
      userProfilePhotoUrl: data.userProfilePhotoUrl,
      userIsStub: data.userIsStub, userCreatedAt: data.userCreatedAt,
    }
    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
    return toMembership(item)
  },

  async update(clubId: string, userId: string, data: {
    role?: ClubMembership['role']; status?: ClubMembership['status'];
    notificationsEnabled?: boolean;
  }): Promise<ClubMembership | null> {
    const sets: string[] = ['#updatedAt = :updatedAt']
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
    const values: Record<string, unknown> = { ':updatedAt': now() }

    if (data.role !== undefined) {
      sets.push('#role = :role')
      names['#role'] = 'role'
      values[':role'] = data.role
      // Update GSI2PK to reflect new role
      sets.push('GSI2PK = :gsi2pk')
      const currentStatus = data.status // will be fetched if needed
      values[':gsi2pk'] = `CLUB#${clubId}#ROLE#${data.role}`
    }
    if (data.status !== undefined) {
      sets.push('#status = :status')
      names['#status'] = 'status'
      values[':status'] = data.status
      sets.push('GSI2SK = :gsi2sk')
      values[':gsi2sk'] = `STATUS#${data.status}#${userId}`
    }
    if (data.notificationsEnabled !== undefined) {
      sets.push('notificationsEnabled = :notif')
      values[':notif'] = data.notificationsEnabled
    }

    const res = await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { PK: `CLUB#${clubId}`, SK: `MEMBER#${userId}` },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return res.Attributes ? toMembership(res.Attributes) : null
  },

  async listActiveWithNotifications(clubId: string): Promise<ClubMembership[]> {
    const { items } = await this.listByClub(clubId, { status: 'ACTIVE' })
    return items.filter(m => m.notificationsEnabled)
  },
}
