export type TemplateName =
  | 'club_connect_match_created'
  | 'club_connect_waitlist_confirmed'
  | 'club_connect_match_cancelled'
  | 'club_connect_match_reminder'
  | 'club_connect_fee_reminder'

export interface MatchCreatedParams {
  clubName: string
  date: string
  time: string
  venue: string
  teams: string
  feeLine: string
}

export interface WaitlistConfirmedParams {
  clubName: string
  date: string
  time: string
  feeReminderLine: string
}

export interface MatchCancelledParams {
  clubName: string
  date: string
  time: string
  venue: string
}

export interface MatchReminderParams {
  clubName: string
  date: string
  time: string
  venue: string
  feeStatusLine: string
}

export interface FeeReminderParams {
  clubName: string
  date: string
  time: string
  feeWithCurrency: string
}

export function buildMatchCreatedParams(p: MatchCreatedParams): Record<string, string> {
  return { '1': p.clubName, '2': p.date, '3': p.time, '4': p.venue, '5': p.teams, '6': p.feeLine }
}

export function buildWaitlistConfirmedParams(p: WaitlistConfirmedParams): Record<string, string> {
  return { '1': p.clubName, '2': p.date, '3': p.time, '4': p.feeReminderLine }
}

export function buildMatchCancelledParams(p: MatchCancelledParams): Record<string, string> {
  return { '1': p.clubName, '2': p.date, '3': p.time, '4': p.venue }
}

export function buildMatchReminderParams(p: MatchReminderParams): Record<string, string> {
  return { '1': p.clubName, '2': p.date, '3': p.time, '4': p.venue, '5': p.feeStatusLine }
}

export function buildFeeReminderParams(p: FeeReminderParams): Record<string, string> {
  return { '1': p.clubName, '2': p.date, '3': p.time, '4': p.feeWithCurrency }
}

export function formatMatchDate(date: Date): { date: string; time: string } {
  return {
    date: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
  }
}
