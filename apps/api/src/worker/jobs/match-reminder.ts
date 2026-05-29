import { db } from '@club-connect/db'
import { getNotificationService } from '@/lib/notifications'
import { buildMatchReminderParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

export async function runMatchReminderJob(): Promise<void> {
  console.log('[match-reminder] Starting match reminder job')

  // Scan for MatchAvailability items with CONFIRMED status
  // Then filter to matches in the next 24 hours
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb')
  const { docClient, getTableName } = await import('@club-connect/db/src/client')

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const res = await docClient.send(new ScanCommand({
    TableName: getTableName(),
    FilterExpression: 'entityType = :et AND #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':et': 'MatchAvailability', ':status': 'CONFIRMED' },
  }))

  const confirmedAvails = res.Items ?? []
  console.log(`[match-reminder] Found ${confirmedAvails.length} confirmed availability records`)

  const ns = getNotificationService()
  let sent = 0

  // Cache match/club lookups
  const matchCache: Record<string, Awaited<ReturnType<typeof db.matches.findById>>> = {}
  const clubCache: Record<string, Awaited<ReturnType<typeof db.clubs.findById>>> = {}

  for (const avail of confirmedAvails) {
    const matchId = avail.matchId as string
    const userId = avail.userId as string

    if (!matchCache[matchId]) {
      matchCache[matchId] = await db.matches.findById(matchId)
    }
    const match = matchCache[matchId]
    if (!match || match.status !== 'OPEN') continue

    const matchDate = new Date(match.date)
    if (matchDate < now || matchDate > in24h) continue

    if (!clubCache[match.clubId]) {
      clubCache[match.clubId] = await db.clubs.findById(match.clubId)
    }
    const club = clubCache[match.clubId]

    const user = await db.users.findById(userId)
    if (!user) continue

    const { date, time } = formatMatchDate(matchDate)

    let feeStatusLine = ''
    if (match.feeAmount) {
      const feePayment = await db.feePayments.get(matchId, userId)
      const feeStr = `${match.feeCurrency} ${match.feeAmount}`
      feeStatusLine = feePayment?.markedPaid
        ? `Fee: ${feeStr} — Paid`
        : `Fee: ${feeStr} — Not yet marked as paid`
    }

    const wasSent = await ns.sendWithDedup({
      userId,
      phone: user.phone,
      templateName: 'club_connect_match_reminder' as TemplateName,
      params: buildMatchReminderParams({
        clubName: club?.name ?? 'Club',
        date,
        time,
        venue: match.venue,
        feeStatusLine,
      }),
      notificationType: 'MATCH_REMINDER_24H',
      referenceId: matchId,
      referenceType: 'match',
      withinHours: 20,
    })

    if (wasSent) sent++
  }

  console.log(`[match-reminder] Sent ${sent} reminders`)
}
