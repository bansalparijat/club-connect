import { prisma } from './prisma'
import { NotificationService, createWhatsAppProvider, type NotificationLogger } from '@club-connect/notifications'
import type { NotificationType } from '@club-connect/types'

class PrismaNotificationLogger implements NotificationLogger {
  async log(opts: {
    userId: string
    type: NotificationType
    referenceId?: string
    referenceType?: string
    status: 'sent' | 'failed'
  }): Promise<void> {
    await prisma.notificationLog.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
        status: opts.status,
      },
    })
  }

  async hasSentRecently(opts: {
    userId: string
    type: NotificationType
    referenceId: string
    withinHours: number
  }): Promise<boolean> {
    const cutoff = new Date(Date.now() - opts.withinHours * 60 * 60 * 1000)
    const existing = await prisma.notificationLog.findFirst({
      where: {
        userId: opts.userId,
        type: opts.type,
        referenceId: opts.referenceId,
        sentAt: { gte: cutoff },
        status: 'sent',
      },
    })
    return existing !== null
  }
}

let notificationService: NotificationService | null = null

export function getNotificationService(): NotificationService {
  if (!notificationService) {
    const provider = createWhatsAppProvider()
    const logger = new PrismaNotificationLogger()
    notificationService = new NotificationService(provider, logger)
  }
  return notificationService
}
