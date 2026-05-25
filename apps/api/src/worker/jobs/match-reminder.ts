import { prisma } from '@club-connect/db'
import { getNotificationService } from '@/lib/notifications'
import { buildMatchReminderParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

export async function runMatchReminderJob(): Promise<void> {
  console.log('[match-reminder] Starting match reminder job')

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const upcomingMatches = await prisma.matchAvailability.findMany({
    where: {
      status: 'CONFIRMED',
      match: {
        status: 'OPEN',
        date: { gte: now, lte: in24h },
      },
    },
    include: {
      user: true,
      match: {
        include: {
          club: true,
          feePayments: true,
        },
      },
    },
  })

  console.log(`[match-reminder] Found ${upcomingMatches.length} confirmed players for upcoming matches`)

  const ns = getNotificationService()
  let sent = 0

  for (const avail of upcomingMatches) {
    const { date, time } = formatMatchDate(avail.match.date)

    const feePayment = avail.match.feePayments.find(fp => fp.userId === avail.userId)
    let feeStatusLine = ''
    if (avail.match.feeAmount) {
      const feeStr = `${avail.match.feeCurrency} ${avail.match.feeAmount}`
      feeStatusLine = feePayment?.markedPaid
        ? `Fee: ${feeStr} — Paid`
        : `Fee: ${feeStr} — Not yet marked as paid`
    }

    const wasSent = await ns.sendWithDedup({
      userId: avail.userId,
      phone: avail.user.phone,
      templateName: 'club_connect_match_reminder' as TemplateName,
      params: buildMatchReminderParams({
        clubName: avail.match.club.name,
        date,
        time,
        venue: avail.match.venue,
        feeStatusLine,
      }),
      notificationType: 'MATCH_REMINDER_24H',
      referenceId: avail.matchId,
      referenceType: 'match',
      withinHours: 20,
    })

    if (wasSent) sent++
  }

  console.log(`[match-reminder] Sent ${sent} reminders`)
}
