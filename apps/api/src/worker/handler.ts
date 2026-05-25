/**
 * Lambda handler for:
 * 1. SQS events (notification queue)
 * 2. EventBridge Scheduler events (cron jobs)
 */

import type { SQSEvent, SQSBatchResponse, ScheduledEvent } from 'aws-lambda'
import { getNotificationService } from '@/lib/notifications'
import { runFeeReminderJob } from './jobs/fee-reminder'
import { runMatchReminderJob } from './jobs/match-reminder'
import type { NotificationJobPayload, CronJobPayload } from '@club-connect/types'

// SQS handler — processes WhatsApp notification messages
export async function sqsHandler(event: SQSEvent): Promise<SQSBatchResponse> {
  const ns = getNotificationService()
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []

  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body) as NotificationJobPayload

      await ns.send({
        userId: payload.payload.userId,
        phone: payload.payload.phone,
        templateName: payload.payload.templateName,
        params: payload.payload.params,
        notificationType: payload.type,
      })
    } catch (err) {
      console.error(`[worker] Failed to process SQS record ${record.messageId}:`, err)
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures }
}

// EventBridge handler — cron jobs
export async function eventBridgeHandler(event: ScheduledEvent & { job?: string }): Promise<void> {
  const payload = event as unknown as CronJobPayload
  console.log('[worker] EventBridge job:', payload.job)

  switch (payload.job) {
    case 'fee_reminder':
      await runFeeReminderJob()
      break
    case 'match_reminder':
      await runMatchReminderJob()
      break
    default:
      console.warn('[worker] Unknown job type:', payload.job)
  }
}

// Default export for Lambda (detects event type)
export const handler = async (event: Record<string, unknown>): Promise<unknown> => {
  if ('Records' in event) {
    return sqsHandler(event as unknown as SQSEvent)
  }
  if ('job' in event) {
    return eventBridgeHandler(event as unknown as ScheduledEvent & { job: string })
  }
  console.warn('[worker] Unrecognised event:', JSON.stringify(event))
}
