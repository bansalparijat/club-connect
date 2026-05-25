import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { setTokens, clearTokens, userApi } from '@/api/client'

export type AuthUser = {
  id: string
  name: string
  phone: string
  profilePhotoUrl: string | null
  isStub: boolean
}

type AuthState = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  pendingPhone: string | null

  // Actions
  setPendingPhone: (phone: string) => void
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>
  updateUser: (updates: Partial<AuthUser>) => void
  restoreSession: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  pendingPhone: null,

  setPendingPhone: (phone) => set({ pendingPhone: phone }),

  setAuth: async (user, accessToken, refreshToken) => {
    await setTokens(accessToken, refreshToken)
    set({ user, isAuthenticated: true, isLoading: false })
  },

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),

  restoreSession: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token')
      if (!token) {
        set({ isLoading: false, isAuthenticated: false })
        return
      }
      const { user } = await userApi.getMe()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      await clearTokens()
      set({ isLoading: false, isAuthenticated: false, user: null })
    }
  },

  signOut: async () => {
    await clearTokens()
    set({ user: null, isAuthenticated: false })
  },
}))
