import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { matchApi, MatchSummary } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { useClubStore } from '@/store/club'
import { MatchCard } from '@/components/MatchCard'
import { ClubSwitcherSheet } from '@/components/ClubSwitcherSheet'

export default function HomeScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { activeClub, activeClubId } = useClubStore()

  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [switcherVisible, setSwitcherVisible] = useState(false)

  const club = activeClub()
  const isAdmin = club?.myRole === 'ADMIN'

  const loadMatches = useCallback(async () => {
    if (!activeClubId) return
    setLoading(true)
    try {
      const { matches: data } = await matchApi.list(activeClubId)
      setMatches(data)
    } catch {
      // Silently fail — user sees empty state
    } finally {
      setLoading(false)
    }
  }, [activeClubId])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  async function handleRefresh() {
    setRefreshing(true)
    await loadMatches()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.clubChip} onPress={() => setSwitcherVisible(true)}>
          <Text style={styles.clubName} numberOfLines={1}>
            {club?.name ?? 'No Club'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#1a56db" />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {activeClubId && (
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => router.push('/(app)/club/profile' as never)}
            >
              <Ionicons name="information-circle-outline" size={24} color="#374151" />
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity onPress={() => router.push('/(app)/club/management' as never)}>
              <Ionicons name="settings-outline" size={22} color="#374151" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Match list */}
      {!activeClubId ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>You're not in any club yet.</Text>
          <Text style={styles.emptySubtext}>Ask your club admin to add you.</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              onPress={() => router.push(`/(app)/match/${item.id}` as never)}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No upcoming matches.</Text>
                {isAdmin && (
                  <Text style={styles.emptySubtext}>Tap + to create one.</Text>
                )}
              </View>
            ) : null
          }
        />
      )}

      {/* Create match FAB (admin) */}
      {isAdmin && activeClubId && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(app)/match/create' as never)}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create club FAB (when user has no clubs) */}
      {!activeClubId && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(app)/club/create' as never)}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <ClubSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  clubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: '80%',
  },
  clubName: { fontSize: 14, fontWeight: '600', color: '#1a56db' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {},
  list: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#9ca3af' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a56db',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a56db',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
})
