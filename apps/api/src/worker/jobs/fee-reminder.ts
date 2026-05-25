import { prisma } from '@club-connect/db'
import { getNotificationService } from '@/lib/notifications'
import { buildFeeReminderParams, formatMatchDate, type TemplateName } from '@club-connect/notifications'

export async function runFeeReminderJob(): Promise<void> {
  console.log('[fee-reminder] Starting fee reminder job')

  const unpaidFees = await prisma.matchFeePayment.findMany({
    where: {
      markedPaid: false,
      match: {
        status: 'OPEN',
        date: { gt: new Date() },
        feeAmount: { not: null },
      },
    },
    include: {
      user: true,
      match: { include: { club: true } },
    },
  })

  console.log(`[fee-reminder] Found ${unpaidFees.length} unpaid fees`)

  const ns = getNotificationService()
  let sent = 0

  for (const fee of unpaidFees) {
    const { date, time } = formatMatchDate(fee.match.date)
    const feeWithCurrency = `${fee.match.feeCurrency} ${fee.match.feeAmount}`

    const wasSent = await ns.sendWithDedup({
      userId: fee.userId,
      phone: fee.user.phone,
      templateName: 'club_connect_fee_reminder' as TemplateName,
      params: buildFeeReminderParams({
        clubName: fee.match.club.name,
        date,
        time,
        feeWithCurrency,
      }),
      notificationType: 'FEE_REMINDER',
      referenceId: fee.matchId,
      referenceType: 'match',
      withinHours: 22, // Allow re-send after 22h (daily cadence)
    })

    if (wasSent) sent++
  }

  console.log(`[fee-reminder] Sent ${sent} reminders`)
}
