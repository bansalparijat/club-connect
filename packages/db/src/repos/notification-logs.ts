import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, getTableName } from '../client'
import { generateId, now } from '../utils'
import type { NotificationLog } from '../types'

export const notificationLogs = {
  async create(data: {
    userId: string; type: string; referenceId?: string; referenceType?: string; status: string
  }): Promise<void> {
    const id = generateId()
    const sentAt = now()
    const item: Record<string, unknown> = {
      PK: `NOTIFLOG#${data.userId}`, SK: `${sentAt}#${id}`,
      entityType: 'NotificationLog',
      id, userId: data.userId, channel: 'whatsapp',
      type: data.type, referenceId: data.referenceId ?? null,
      referenceType: data.referenceType ?? null,
      sentAt, status: data.status,
    }

    // GSI1 for dedup lookups
    if (data.referenceId) {
      item.GSI1PK = `NOTIF_REF#${data.referenceId}#${data.type}`
      item.GSI1SK = sentAt
    }

    await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
  },

  async hasSentRecently(opts: {
    userId: string; type: string; referenceId: string; withinHours: number
  }): Promise<boolean> {
    const cutoff = new Date(Date.now() - opts.withinHours * 60 * 60 * 1000).toISOString()

    const res = await docClient.send(new QueryCommand({
      TableName: getTableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK > :cutoff',
      ExpressionAttributeValues: {
        ':pk': `NOTIF_REF#${opts.referenceId}#${opts.type}`,
        ':cutoff': cutoff,
      },
      FilterExpression: 'userId = :uid AND #status = :sent',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':pk': `NOTIF_REF#${opts.referenceId}#${opts.type}`,
        ':cutoff': cutoff,
        ':uid': opts.userId,
        ':sent': 'sent',
      },
      Limit: 1,
    }))

    return (res.Items?.length ?? 0) > 0
  },
}
