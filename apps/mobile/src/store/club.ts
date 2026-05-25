import { create } from 'zustand'
import { clubApi, ClubSummary } from '@/api/client'

type ClubState = {
  clubs: ClubSummary[]
  activeClubId: string | null
  isLoading: boolean

  // Computed
  activeClub: () => ClubSummary | null

  // Actions
  loadClubs: () => Promise<void>
  setActiveClub: (clubId: string) => void
  addClub: (club: ClubSummary) => void
  updateClub: (club: ClubSummary) => void
}

export const useClubStore = create<ClubState>((set, get) => ({
  clubs: [],
  activeClubId: null,
  isLoading: false,

  activeClub: () => {
    const { clubs, activeClubId } = get()
    return clubs.find((c) => c.id === activeClubId) ?? null
  },

  loadClubs: async () => {
    set({ isLoading: true })
    try {
      const { clubs } = await clubApi.list()
      const activeClubId = clubs.length > 0 ? clubs[0].id : null
      set({ clubs, activeClubId, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  setActiveClub: (clubId) => set({ activeClubId: clubId }),

  addClub: (club) =>
    set((state) => ({
      clubs: [...state.clubs, club],
      activeClubId: state.activeClubId ?? club.id,
    })),

  updateClub: (updated) =>
    set((state) => ({
      clubs: state.clubs.map((c) => (c.id === updated.id ? updated : c)),
    })),
}))
