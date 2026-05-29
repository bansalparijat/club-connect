// Entity types matching the old Prisma models but as plain interfaces

export interface User {
  id: string
  phone: string
  name: string
  profilePhotoUrl: string | null
  isStub: boolean
  createdAt: string // ISO string
  updatedAt: string
}

export interface RefreshToken {
  id: string
  userId: string
  token: string
  expiresAt: string
  createdAt: string
}

export interface Club {
  id: string
  name: string
  description: string | null
  logoUrl: string | null
  sportTypeId: string
  createdById: string
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface ClubMembership {
  clubId: string
  userId: string
  role: 'ADMIN' | 'MEMBER'
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'LEFT'
  notificationsEnabled: boolean
  joinedAt: string
  updatedAt: string
  // Denormalized user fields for listing
  userName: string
  userPhone: string
  userProfilePhotoUrl: string | null
  userIsStub: boolean
  userCreatedAt: string
}

export interface House {
  id: string
  clubId: string
  name: string
  color: string | null
  logoUrl: string | null
}

export interface Season {
  id: string
  clubId: string
  name: string
  startDate: string
  endDate: string | null
  isActive: boolean
  isEnded: boolean
  createdAt: string
  updatedAt: string
}

export interface HouseMembership {
  id: string
  houseId: string
  userId: string
  seasonId: string
}

export interface SportType {
  id: string
  name: string
}

export interface SportParameter {
  id: string
  sportTypeId: string
  name: string
  type: 'SELECT' | 'TEXT' | 'BOOLEAN'
  options: string[] | null
  isRequired: boolean
  displayOrder: number
}

export interface Match {
  id: string
  clubId: string
  seasonId: string | null
  title: string
  date: string // ISO string
  venue: string
  capacity: number
  waitlistSize: number
  feeAmount: number | null
  feeCurrency: string | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED'
  createdById: string
  confirmedCount: number
  waitlistedCount: number
  createdAt: string
  updatedAt: string
}

export interface MatchHouse {
  matchId: string
  houseId: string
}

export interface MatchParameter {
  matchId: string
  key: string
  value: string
  sportParamId: string | null
  isCustom: boolean
}

export interface MatchAvailability {
  matchId: string
  userId: string
  status: 'CONFIRMED' | 'WAITLISTED' | 'UNAVAILABLE' | 'DROPPED'
  position: number | null
  respondedAt: string
  updatedAt: string
  // Denormalized
  userName: string
  userPhone: string
  userProfilePhotoUrl: string | null
  userIsStub: boolean
  userCreatedAt: string
}

export interface MatchFeePayment {
  matchId: string
  userId: string
  markedPaid: boolean
  markedAt: string | null
  createdAt: string
}

export interface MatchCaptain {
  matchId: string
  userId: string
}

export interface UserUnavailability {
  id: string
  userId: string
  clubId: string | null
  type: 'SPECIFIC_DATE' | 'RECURRING_WEEKLY'
  date: string | null
  dayOfWeek: number | null
  startFrom: string | null
  weeksAhead: number | null
  createdAt: string
}

export interface NotificationLog {
  id: string
  userId: string
  channel: string
  type: string
  referenceId: string | null
  referenceType: string | null
  sentAt: string
  status: string
}
