import { db } from '@club-connect/db'
import { NotificationService, createWhatsAppProvider, type NotificationLogger } from '@club-connect/notifications'
import type { NotificationType } from '@club-connect/types'

class DynamoNotificationLogger implements NotificationLogger {
  async log(opts: {
    userId: string
    type: NotificationType
    referenceId?: string
    referenceType?: string
    status: 'sent' | 'failed'
  }): Promise<void> {
    await db.notificationLogs.create({
      userId: opts.userId,
      type: opts.type,
      referenceId: opts.referenceId,
      referenceType: opts.referenceType,
      status: opts.status,
    })
  }

  async hasSentRecently(opts: {
    userId: string
    type: NotificationType
    referenceId: string
    withinHours: number
  }): Promise<boolean> {
    return db.notificationLogs.hasSentRecently({
      userId: opts.userId,
      type: opts.type,
      referenceId: opts.referenceId,
      withinHours: opts.withinHours,
    })
  }
}

let notificationService: NotificationService | null = null

export function getNotificationService(): NotificationService {
  if (!notificationService) {
    const provider = createWhatsAppProvider()
    const logger = new DynamoNotificationLogger()
    notificationService = new NotificationService(provider, logger)
  }
  return notificationService
}
