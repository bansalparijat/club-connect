import type { WhatsAppProvider } from './provider'
import type { NotificationType } from '@club-connect/types'

export interface SendNotificationOptions {
  userId: string
  phone: string
  templateName: string
  params: Record<string, string>
  notificationType: NotificationType
  referenceId?: string
  referenceType?: string
}

export interface NotificationLogger {
  log(opts: {
    userId: string
    type: NotificationType
    referenceId?: string
    referenceType?: string
    status: 'sent' | 'failed'
  }): Promise<void>

  hasSentRecently(opts: {
    userId: string
    type: NotificationType
    referenceId: string
    withinHours: number
  }): Promise<boolean>
}

export class NotificationService {
  constructor(
    private readonly provider: WhatsAppProvider,
    private readonly logger: NotificationLogger
  ) {}

  async send(opts: SendNotificationOptions): Promise<boolean> {
    try {
      await this.provider.sendTemplate(opts.phone, opts.templateName, opts.params)
      await this.logger.log({
        userId: opts.userId,
        type: opts.notificationType,
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
        status: 'sent',
      })
      return true
    } catch (err) {
      console.error(`[NotificationService] Failed to send ${opts.notificationType} to ${opts.phone}:`, err)
      await this.logger.log({
        userId: opts.userId,
        type: opts.notificationType,
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
        status: 'failed',
      }).catch(() => {})
      return false
    }
  }

  async sendWithDedup(
    opts: SendNotificationOptions & { withinHours?: number }
  ): Promise<boolean> {
    if (opts.referenceId) {
      const alreadySent = await this.logger.hasSentRecently({
        userId: opts.userId,
        type: opts.notificationType,
        referenceId: opts.referenceId,
        withinHours: opts.withinHours ?? 24,
      })
      if (alreadySent) return false
    }
    return this.send(opts)
  }
}

export function createWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'meta'

  if (provider === 'twilio') {
    const { TwilioWhatsAppProvider } = require('./providers/twilio')
    return new TwilioWhatsAppProvider(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
      process.env.TWILIO_WHATSAPP_FROM!
    )
  }

  const { MetaCloudProvider } = require('./providers/meta')
  return new MetaCloudProvider(
    process.env.META_WHATSAPP_TOKEN!,
    process.env.META_PHONE_NUMBER_ID!
  )
}
