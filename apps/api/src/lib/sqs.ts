import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import type { NotificationJobPayload } from '@club-connect/types'

let sqsClient: SQSClient | null = null

function getClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
  }
  return sqsClient
}

export async function enqueueNotification(payload: NotificationJobPayload): Promise<void> {
  const queueUrl = process.env.SQS_QUEUE_URL
  if (!queueUrl) {
    // In dev without SQS, log and skip
    console.log('[SQS Mock] Would enqueue notification:', JSON.stringify(payload, null, 2))
    return
  }

  await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    })
  )
}

export async function enqueueBatch(payloads: NotificationJobPayload[]): Promise<void> {
  // Send each individually (SQS batch max is 10, but we keep it simple)
  await Promise.allSettled(payloads.map(enqueueNotification))
}
