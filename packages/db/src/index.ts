import { users } from './repos/users'
import { refreshTokens } from './repos/refresh-tokens'
import { clubs } from './repos/clubs'
import { memberships } from './repos/memberships'
import { houses } from './repos/houses'
import { seasons } from './repos/seasons'
import { houseMemberships } from './repos/house-memberships'
import { sportTypes } from './repos/sport-types'
import { matches } from './repos/matches'
import { availability } from './repos/availability'
import { feePayments } from './repos/fee-payments'
import { captains } from './repos/captains'
import { unavailability } from './repos/unavailability'
import { notificationLogs } from './repos/notification-logs'

export const db = {
  users,
  refreshTokens,
  clubs,
  memberships,
  houses,
  seasons,
  houseMemberships,
  sportTypes,
  matches,
  availability,
  feePayments,
  captains,
  unavailability,
  notificationLogs,
}

export { getTableName } from './client'
export * from './types'
