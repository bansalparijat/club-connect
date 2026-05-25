// ─── Enums (mirrored from DB for use in mobile/API) ──────────────────────────

export type ClubRole = 'ADMIN' | 'MEMBER'
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'LEFT'
export type ParameterType = 'SELECT' | 'TEXT' | 'BOOLEAN'
export type MatchStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED'
export type AvailabilityStatus = 'CONFIRMED' | 'WAITLISTED' | 'UNAVAILABLE' | 'DROPPED'
export type UnavailabilityType = 'SPECIFIC_DATE' | 'RECURRING_WEEKLY'
export type NotificationType =
  | 'MATCH_CREATED'
  | 'WAITLIST_CONFIRMED'
  | 'FEE_REMINDER'
  | 'MATCH_CANCELLED'
  | 'MATCH_REMINDER_24H'

// ─── Base Entities ────────────────────────────────────────────────────────────

export interface UserDTO {
  id: string
  phone: string
  name: string
  profilePhotoUrl: string | null
  isStub: boolean
  createdAt: string
}

export interface ClubDTO {
  id: string
  name: string
  description: string | null
  logoUrl: string | null
  sportTypeId: string
  createdById: string
  createdAt: string
}

export interface ClubMembershipDTO {
  id: string
  clubId: string
  userId: string
  role: ClubRole
  status: MembershipStatus
  notificationsEnabled: boolean
  joinedAt: string
}

export interface HouseDTO {
  id: string
  clubId: string
  name: string
  color: string | null
}

export interface SeasonDTO {
  id: string
  clubId: string
  name: string
  startDate: string
  endDate: string | null
  isActive: boolean
  createdAt: string
}

export interface HouseMembershipDTO {
  id: string
  houseId: string
  userId: string
  seasonId: string
}

export interface SportTypeDTO {
  id: string
  name: string
  parameters: SportParameterDTO[]
}

export interface SportParameterDTO {
  id: string
  sportTypeId: string
  name: string
  type: ParameterType
  options: string[] | null
  isRequired: boolean
  displayOrder: number
}

export interface MatchDTO {
  id: string
  clubId: string
  title: string
  date: string
  venue: string
  capacity: number
  waitlistSize: number
  feeAmount: string | null
  feeCurrency: string | null
  status: MatchStatus
  createdById: string
  createdAt: string
}

export interface MatchParameterDTO {
  id: string
  matchId: string
  key: string
  value: string
  sportParamId: string | null
  isCustom: boolean
}

export interface MatchAvailabilityDTO {
  id: string
  matchId: string
  userId: string
  status: AvailabilityStatus
  position: number | null
  respondedAt: string
  updatedAt: string
}

export interface MatchFeePaymentDTO {
  id: string
  matchId: string
  userId: string
  markedPaid: boolean
  markedAt: string | null
}

export interface MatchCaptainDTO {
  id: string
  matchId: string
  userId: string
}

export interface UserUnavailabilityDTO {
  id: string
  userId: string
  clubId: string | null
  type: UnavailabilityType
  date: string | null
  dayOfWeek: number | null
  startFrom: string | null
  weeksAhead: number | null
  createdAt: string
}

// ─── API Request Bodies ───────────────────────────────────────────────────────

export interface SendOtpRequest {
  phone: string
}

export interface VerifyOtpRequest {
  phone: string
  otp: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface UpdateUserRequest {
  name?: string
  profilePhotoUrl?: string
}

export interface CreateClubRequest {
  name: string
  sportTypeId: string
  description?: string
  logoUrl?: string
}

export interface UpdateClubRequest {
  name?: string
  description?: string
  logoUrl?: string
}

export interface AddMemberRequest {
  phone: string
  name: string
}

export interface UpdateMemberRequest {
  role?: ClubRole
  status?: MembershipStatus
}

export interface CreateHouseRequest {
  name: string
  color?: string
}

export interface UpdateHouseRequest {
  name?: string
  color?: string
}

export interface CreateSeasonRequest {
  name: string
  startDate: string
  endDate?: string
}

export interface UpdateSeasonRequest {
  name?: string
  startDate?: string
  endDate?: string
  isActive?: boolean
}

export interface AssignHouseMembershipRequest {
  userId: string
  houseId: string
}

export interface CreateMatchParameterInput {
  key: string
  value: string
  sportParamId?: string
  isCustom?: boolean
}

export interface CreateMatchRequest {
  title: string
  date: string
  venue: string
  capacity: number
  waitlistSize: number
  feeAmount?: number
  feeCurrency?: string
  houseIds: string[]
  parameters: CreateMatchParameterInput[]
}

export interface UpdateMatchRequest {
  title?: string
  venue?: string
  capacity?: number
  waitlistSize?: number
  feeAmount?: number | null
  status?: MatchStatus
}

export interface MarkAvailabilityRequest {
  status: 'AVAILABLE' | 'UNAVAILABLE'
}

export interface UpdateAvailabilityRequest {
  status: 'DROPPED' | 'UNAVAILABLE' | 'CONFIRMED'
}

export interface MarkFeePaymentRequest {
  markedPaid: true
}

export interface AddGuestRequest {
  phone: string
  name: string
}

export interface AssignCaptainRequest {
  userId: string
}

export interface CreateUnavailabilityRequest {
  clubId?: string
  type: UnavailabilityType
  date?: string
  dayOfWeek?: number
  startFrom?: string
  weeksAhead?: number
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: UserDTO
}

export interface MatchSummary {
  id: string
  title: string
  date: string
  venue: string
  status: MatchStatus
  capacity: number
  waitlistSize: number
  confirmedCount: number
  waitlistedCount: number
  myStatus: AvailabilityStatus | null
  hasFeeDue: boolean
  houses: HouseDTO[]
}

export interface AvailabilityEntry {
  user: UserDTO
  respondedAt: string
}

export interface WaitlistedEntry {
  user: UserDTO
  position: number
  respondedAt: string
}

export interface MatchDetailResponse {
  match: MatchDTO
  parameters: MatchParameterDTO[]
  houses: HouseDTO[]
  availability: {
    confirmed: AvailabilityEntry[]
    waitlisted: WaitlistedEntry[]
    unavailable: AvailabilityEntry[]
    dropped: AvailabilityEntry[]
  }
  myStatus: AvailabilityStatus | null
  fee: {
    amount: string
    currency: string
    myMarkedPaid: boolean
  } | null
  captains: UserDTO[]
}

export interface MemberWithDetails {
  id: string
  clubId: string
  userId: string
  role: ClubRole
  status: MembershipStatus
  notificationsEnabled: boolean
  joinedAt: string
  user: UserDTO
  house: HouseDTO | null
}

export interface ClubWithRole extends ClubDTO {
  myRole: ClubRole
  memberCount: number
  sportType: SportTypeDTO
}

export interface FeePaymentEntry {
  user: UserDTO
  markedPaid: boolean
  markedAt: string | null
}

export interface ImportError {
  row: number
  phone: string
  reason: string
}

export interface ImportResult {
  imported: number
  existing: number
  errors: ImportError[]
  total: number
}

// ─── SQS Message Payloads ─────────────────────────────────────────────────────

export interface NotificationJobPayload {
  type: NotificationType
  payload: {
    userId: string
    phone: string
    templateName: string
    params: Record<string, string>
  }
}

export interface CronJobPayload {
  job: 'fee_reminder' | 'match_reminder'
}

// ─── Error Response ───────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
