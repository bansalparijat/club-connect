import { db } from '@club-connect/db'
import { getNotificationService } from '@/lib/notifications'
import { buildFeeReminderParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

export async function runFeeReminderJob(): Promise<void> {
  console.log('[fee-reminder] Starting fee reminder job')

  // Get all open matches with fees that are in the future
  // We need to scan club matches — get all clubs first, then their matches
  // For now, a pragmatic approach: scan all matches via GSI2 per-club is impractical
  // Instead, we'll query fee payments per match for open matches.
  // This requires knowing which matches are open+future+have fees.
  // With DynamoDB, we scan the table for MatchFeePayment items where markedPaid=false,
  // then filter by match status/date. This is acceptable at low scale.

  // Alternative: iterate known clubs → their matches → fee payments
  // For free-tier scale, a scan with filter is acceptable
  const { DynamoDBDocumentClient, ScanCommand } = await import('@aws-sdk/lib-dynamodb')
  const { docClient, getTableName } = await import('@club-connect/db/src/client')

  const now = new Date().toISOString()
  const res = await docClient.send(new ScanCommand({
    TableName: getTableName(),
    FilterExpression: 'entityType = :et AND markedPaid = :paid',
    ExpressionAttributeValues: { ':et': 'MatchFeePayment', ':paid': false },
  }))

  const unpaidFees = res.Items ?? []
  console.log(`[fee-reminder] Found ${unpaidFees.length} unpaid fee records`)

  const ns = getNotificationService()
  let sent = 0

  for (const fee of unpaidFees) {
    const matchId = fee.matchId as string
    const userId = fee.userId as string

    const match = await db.matches.findById(matchId)
    if (!match || match.status !== 'OPEN' || match.date <= now || !match.feeAmount) continue

    const user = await db.users.findById(userId)
    if (!user) continue

    const club = await db.clubs.findById(match.clubId)

    const { date, time } = formatMatchDate(new Date(match.date))
    const feeWithCurrency = `${match.feeCurrency} ${match.feeAmount}`

    const wasSent = await ns.sendWithDedup({
      userId,
      phone: user.phone,
      templateName: 'club_connect_fee_reminder' as TemplateName,
      params: buildFeeReminderParams({
        clubName: club?.name ?? 'Club',
        date,
        time,
        feeWithCurrency,
      }),
      notificationType: 'FEE_REMINDER',
      referenceId: matchId,
      referenceType: 'match',
      withinHours: 22,
    })

    if (wasSent) sent++
  }

  console.log(`[fee-reminder] Sent ${sent} reminders`)
}
