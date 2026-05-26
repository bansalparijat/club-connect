import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { matchApi, MatchSummary } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Badge } from '@/components/ui/Badge'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function statusVariant(status: MatchSummary['status']): 'green' | 'gray' | 'red' | 'blue' {
  if (status === 'OPEN') return 'green'
  if (status === 'CLOSED') return 'blue'
  if (status === 'CANCELLED') return 'red'
  return 'gray'
}

export default function SeasonMatchesScreen() {
  const { seasonId, seasonName } = useLocalSearchParams<{ seasonId: string; seasonName: string }>()
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!activeClubId || !seasonId) return
    try {
      const { matches: m, total: t } = await matchApi.list(activeClubId, { seasonId, limit: 50 })
      setMatches(m)
      setTotal(t)
    } catch {} finally {
      setLoading(false)
    }
  }, [activeClubId, seasonId])

  useEffect(() => { load() }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#1a56db" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle} numberOfLines={1}>{seasonName}</Text>
          <Text style={styles.headerSub}>{total} match{total !== 1 ? 'es' : ''}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.matchCard}
            onPress={() => router.push(`/(app)/match/${item.id}` as never)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.matchTitle}>{item.title}</Text>
              <Badge label={item.status} variant={statusVariant(item.status)} />
            </View>
            <Text style={styles.matchDate}>{formatDate(item.date)} at {formatTime(item.date)}</Text>
            <Text style={styles.matchVenue}>📍 {item.venue}</Text>
            {item.houses.length > 0 && (
              <Text style={styles.matchHouses}>{item.houses.map(h => h.name).join(' vs ')}</Text>
            )}
            <View style={styles.cardStats}>
              <Text style={styles.statText}>
                👥 {item.confirmedCount}/{item.capacity}
                {item.waitlistedCount > 0 ? ` · ${item.waitlistedCount} waitlisted` : ''}
              </Text>
              {item.myStatus && (
                <Badge
                  label={item.myStatus === 'CONFIRMED' ? 'Going' : item.myStatus === 'WAITLISTED' ? 'Waitlisted' : item.myStatus}
                  variant={item.myStatus === 'CONFIRMED' ? 'green' : item.myStatus === 'WAITLISTED' ? 'yellow' : 'gray'}
                />
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No matches in this season yet.</Text>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280' },
  list: { padding: 16, paddingBottom: 40 },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  matchTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827', marginRight: 8 },
  matchDate: { fontSize: 13, color: '#374151', marginBottom: 4 },
  matchVenue: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  matchHouses: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  cardStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  statText: { fontSize: 12, color: '#6b7280' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingTop: 60 },
})
