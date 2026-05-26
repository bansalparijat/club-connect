import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

const BASE_URL = (Constants.expoConfig?.extra?.apiUrl as string) || 'http://localhost:3000'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

// ─── Token helpers ─────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ])
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ])
}

// ─── API error ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Core fetch ────────────────────────────────────────────────────────────────

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
  if (!refreshToken) return null

  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      await clearTokens()
      return null
    }
    const data = await res.json()
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken)
    return data.accessToken as string
  } catch {
    await clearTokens()
    return null
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    // Deduplicate concurrent refresh attempts
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false
        refreshPromise = null
      })
    }
    const newToken = await refreshPromise
    if (newToken) {
      return apiFetch<T>(path, options, false)
    }
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.')
  }

  if (res.status === 204) return undefined as T

  const json = await res.json()

  if (!res.ok) {
    const err = json?.error ?? {}
    throw new ApiError(res.status, err.code ?? 'API_ERROR', err.message ?? 'Request failed')
  }

  return json as T
}

// ─── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) =>
    apiFetch<{ message: string; expiresIn: number }>('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, otp: string) =>
    apiFetch<{
      accessToken: string
      refreshToken: string
      user: { id: string; name: string; phone: string; isStub: boolean; profilePhotoUrl: string | null }
    }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),

  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
}

// ─── User API ──────────────────────────────────────────────────────────────────

export type Me = {
  id: string
  name: string
  phone: string
  profilePhotoUrl: string | null
  isStub: boolean
}

export const userApi = {
  getMe: () => apiFetch<{ user: Me }>('/api/users/me'),

  updateMe: (data: { name?: string; profilePhotoUrl?: string }) =>
    apiFetch<{ user: Me }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}

// ─── Club API ──────────────────────────────────────────────────────────────────

export type ClubSummary = {
  id: string
  name: string
  description: string | null
  logoUrl: string | null
  sportTypeId: string
  myRole: 'ADMIN' | 'MEMBER'
  memberCount: number
}

export type ClubDetail = ClubSummary & {
  sportType: { id: string; name: string; parameters: SportParameter[] }
  myMembership: { role: 'ADMIN' | 'MEMBER'; status: string }
  activeSeason: Season | null
}

export type SportParameter = {
  id: string
  name: string
  type: 'SELECT' | 'TEXT' | 'BOOLEAN'
  options: string[] | null
  isRequired: boolean
  displayOrder: number
}

export type Season = {
  id: string
  name: string
  startDate: string
  endDate: string | null
  isActive: boolean
  isEnded: boolean
}

export type House = {
  id: string
  name: string
  color: string | null
  logoUrl: string | null
}

export type Member = {
  id: string
  userId: string
  role: 'ADMIN' | 'MEMBER'
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'LEFT'
  joinedAt: string
  user: { id: string; name: string; phone: string; profilePhotoUrl: string | null }
  house: House | null
}

export const clubApi = {
  list: () => apiFetch<{ clubs: ClubSummary[] }>('/api/clubs'),

  get: (clubId: string) => apiFetch<{ club: ClubDetail }>(`/api/clubs/${clubId}`),

  create: (data: { name: string; sportTypeId: string; description?: string; logoUrl?: string }) =>
    apiFetch<{ club: ClubSummary }>('/api/clubs', { method: 'POST', body: JSON.stringify(data) }),

  update: (clubId: string, data: Partial<{ name: string; description: string; logoUrl: string }>) =>
    apiFetch<{ club: ClubSummary }>(`/api/clubs/${clubId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Members
  getMembers: (clubId: string, params?: { status?: string; role?: string; page?: number; limit?: number; search?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== ''))
    const qs = new URLSearchParams(filtered as Record<string, string>).toString()
    return apiFetch<{ members: Member[]; total: number }>(`/api/clubs/${clubId}/members${qs ? `?${qs}` : ''}`)
  },

  addMember: (clubId: string, data: { phone: string; name: string; houseId?: string }) =>
    apiFetch<{ membership: Member; user: { id: string }; isNew: boolean }>(`/api/clubs/${clubId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  bulkAssignHouses: (clubId: string, seasonId: string, assignments: Array<{ userId: string; houseId: string }>) =>
    apiFetch<{ updated: number }>(`/api/clubs/${clubId}/members/bulk-houses`, {
      method: 'POST',
      body: JSON.stringify({ seasonId, assignments }),
    }),

  updateMember: (clubId: string, userId: string, data: { role?: string; status?: string }) =>
    apiFetch<{ membership: Member }>(`/api/clubs/${clubId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  removeMember: (clubId: string, userId: string) =>
    apiFetch<void>(`/api/clubs/${clubId}/members/${userId}`, { method: 'DELETE' }),

  // Houses
  getHouses: (clubId: string) => apiFetch<{ houses: House[] }>(`/api/clubs/${clubId}/houses`),

  createHouse: (clubId: string, data: { name: string; color?: string; logoUrl?: string }) =>
    apiFetch<{ house: House }>(`/api/clubs/${clubId}/houses`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateHouse: (clubId: string, houseId: string, data: Partial<{ name: string; color: string; logoUrl: string }>) =>
    apiFetch<{ house: House }>(`/api/clubs/${clubId}/houses/${houseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteHouse: (clubId: string, houseId: string) =>
    apiFetch<void>(`/api/clubs/${clubId}/houses/${houseId}`, { method: 'DELETE' }),

  // Seasons
  getSeasons: (clubId: string) => apiFetch<{ seasons: Season[] }>(`/api/clubs/${clubId}/seasons`),

  createSeason: (clubId: string, data: { name: string; startDate: string; endDate?: string }) =>
    apiFetch<{ season: Season }>(`/api/clubs/${clubId}/seasons`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSeason: (clubId: string, seasonId: string, data: Partial<{ name: string; startDate: string; endDate: string; isActive: boolean; isEnded: boolean }>) =>
    apiFetch<{ season: Season }>(`/api/clubs/${clubId}/seasons/${seasonId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  assignHouse: (clubId: string, seasonId: string, data: { userId: string; houseId: string }) =>
    apiFetch<{ houseMembership: object }>(`/api/clubs/${clubId}/seasons/${seasonId}/house-memberships`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ─── Sport Types API ───────────────────────────────────────────────────────────

export const sportTypesApi = {
  list: () =>
    apiFetch<{ sportTypes: Array<{ id: string; name: string; parameters: SportParameter[] }> }>('/api/sport-types'),
}

// ─── Match API ─────────────────────────────────────────────────────────────────

export type MatchSummary = {
  id: string
  title: string
  date: string
  venue: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED'
  capacity: number
  confirmedCount: number
  waitlistedCount: number
  myStatus: 'CONFIRMED' | 'WAITLISTED' | 'UNAVAILABLE' | 'DROPPED' | null
  hasFeeDue: boolean
  houses: House[]
}

export type PlayerHouse = { id: string; name: string; color: string | null; logoUrl: string | null }

export type MatchDetail = {
  match: {
    id: string
    title: string
    date: string
    venue: string
    capacity: number
    waitlistSize: number
    status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED'
    feeAmount: string | null
    feeCurrency: string | null
    seasonId: string | null
  }
  parameters: Array<{ key: string; value: string; isCustom: boolean }>
  houses: House[]
  availability: {
    confirmed: Array<{ user: { id: string; name: string; profilePhotoUrl: string | null }; respondedAt: string; house: PlayerHouse | null; hasPaid: boolean }>
    waitlisted: Array<{ user: { id: string; name: string; profilePhotoUrl: string | null }; position: number; respondedAt: string; house: PlayerHouse | null; hasPaid: boolean }>
    unavailable: Array<{ user: { id: string; name: string; profilePhotoUrl: string | null } }>
    dropped: Array<{ user: { id: string; name: string; profilePhotoUrl: string | null } }>
  }
  myStatus: 'CONFIRMED' | 'WAITLISTED' | 'UNAVAILABLE' | 'DROPPED' | null
  fee: { amount: string; currency: string; myMarkedPaid: boolean } | null
  captains: Array<{ id: string; name: string }>
}

export const matchApi = {
  list: (clubId: string, params?: { status?: string; from?: string; to?: string; seasonId?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return apiFetch<{ matches: MatchSummary[]; total: number }>(`/api/clubs/${clubId}/matches${qs ? `?${qs}` : ''}`)
  },

  create: (clubId: string, data: {
    title: string
    date: string
    venue: string
    capacity: number
    waitlistSize: number
    feeAmount?: number
    feeCurrency?: string
    houseIds: string[]
    seasonId?: string
    parameters: Array<{ key: string; value: string; sportParamId?: string; isCustom?: boolean }>
  }) =>
    apiFetch<{ match: MatchSummary }>(`/api/clubs/${clubId}/matches`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (matchId: string) => apiFetch<MatchDetail>(`/api/matches/${matchId}`),

  update: (matchId: string, data: Partial<{ title: string; date: string; venue: string; capacity: number; waitlistSize: number; feeAmount: number; status: string }>) =>
    apiFetch<{ match: MatchSummary }>(`/api/matches/${matchId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancel: (matchId: string) =>
    apiFetch<void>(`/api/matches/${matchId}`, { method: 'DELETE' }),

  // Availability
  markAvailability: (matchId: string, status: 'AVAILABLE' | 'UNAVAILABLE') =>
    apiFetch<{ availability: { status: string } }>(`/api/matches/${matchId}/availability`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  updateAvailability: (matchId: string, data: { status: string; userId?: string }) =>
    apiFetch<{ availability: { status: string }; newlyConfirmed: object | null }>(`/api/matches/${matchId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Fees
  getFees: (matchId: string) =>
    apiFetch<{ payments: Array<{ user: { id: string; name: string }; markedPaid: boolean; markedAt: string | null }>; summary: { total: number; paid: number; unpaid: number } | null }>(`/api/matches/${matchId}/fees`),

  markFeePaid: (matchId: string) =>
    apiFetch<{ payment: object }>(`/api/matches/${matchId}/fees/me`, {
      method: 'PATCH',
      body: JSON.stringify({ markedPaid: true }),
    }),

  // Guests
  addGuest: (matchId: string, data: { phone: string; name: string }) =>
    apiFetch<{ user: object; availability: object; isNew: boolean }>(`/api/matches/${matchId}/guests`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Captains
  addCaptain: (matchId: string, userId: string) =>
    apiFetch<{ captain: object }>(`/api/matches/${matchId}/captains`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  removeCaptain: (matchId: string, userId: string) =>
    apiFetch<void>(`/api/matches/${matchId}/captains/${userId}`, { method: 'DELETE' }),
}

// ─── Unavailability API ────────────────────────────────────────────────────────

export type UnavailabilityRule = {
  id: string
  type: 'SPECIFIC_DATE' | 'RECURRING_WEEKLY'
  date: string | null
  dayOfWeek: number | null
  startFrom: string | null
  weeksAhead: number | null
  clubId: string | null
  createdAt: string
}

export const unavailabilityApi = {
  list: (clubId?: string) => {
    const qs = clubId ? `?clubId=${clubId}` : ''
    return apiFetch<{ rules: UnavailabilityRule[] }>(`/api/users/me/unavailability${qs}`)
  },

  create: (data: {
    clubId?: string
    type: 'SPECIFIC_DATE' | 'RECURRING_WEEKLY'
    date?: string
    dayOfWeek?: number
    startFrom?: string
    weeksAhead?: number
  }) =>
    apiFetch<{ rule: UnavailabilityRule }>('/api/users/me/unavailability', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (ruleId: string) =>
    apiFetch<void>(`/api/users/me/unavailability/${ruleId}`, { method: 'DELETE' }),
}
