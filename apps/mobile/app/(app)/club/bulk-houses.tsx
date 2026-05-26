import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { clubApi, House, Member, Season } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'

export default function BulkHousesScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [members, setMembers] = useState<Member[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // userId → houseId
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!activeClubId) return
    try {
      const [{ members: m }, { houses: h }, { seasons }] = await Promise.all([
        clubApi.getMembers(activeClubId, { status: 'ACTIVE', limit: 200 }),
        clubApi.getHouses(activeClubId),
        clubApi.getSeasons(activeClubId),
      ])
      setMembers(m)
      setHouses(h)
      const active = seasons.find(s => s.isActive && !s.isEnded) ?? null
      setActiveSeason(active)
      // Pre-fill existing house assignments
      const initial: Record<string, string> = {}
      m.forEach(mem => { if (mem.house) initial[mem.userId] = mem.house.id })
      setAssignments(initial)
    } catch {} finally {
      setLoading(false)
    }
  }, [activeClubId])

  useEffect(() => { load() }, [load])

  function assignHouse(userId: string, houseId: string) {
    setAssignments(prev => ({ ...prev, [userId]: houseId }))
  }

  function clearHouse(userId: string) {
    setAssignments(prev => { const next = { ...prev }; delete next[userId]; return next })
  }

  async function handleSave() {
    if (!activeSeason) {
      Alert.alert('No Active Season', 'Create and activate a season first before assigning houses.')
      return
    }
    const list = Object.entries(assignments).map(([userId, houseId]) => ({ userId, houseId }))
    if (list.length === 0) {
      Alert.alert('No Assignments', 'Assign at least one member to a house.')
      return
    }
    setSaving(true)
    try {
      const { updated } = await clubApi.bulkAssignHouses(activeClubId!, activeSeason.id, list)
      Alert.alert('Saved', `${updated} house assignment${updated !== 1 ? 's' : ''} updated.`, [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#1a56db" />
      </SafeAreaView>
    )
  }

  if (houses.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Assign Houses</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.empty}>No houses set up yet. Create houses first.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Assign Houses</Text>
          {activeSeason && <Text style={styles.headerSub}>Season: {activeSeason.name}</Text>}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {!activeSeason && (
        <View style={styles.warningBar}>
          <Ionicons name="warning-outline" size={16} color="#92400e" />
          <Text style={styles.warningText}>No active season. Activate a season first.</Text>
        </View>
      )}

      {/* House legend */}
      <View style={styles.legend}>
        {houses.map(h => (
          <View key={h.id} style={styles.legendItem}>
            <View style={[styles.houseDot, { backgroundColor: h.color ?? '#9ca3af' }]} />
            <Text style={styles.legendText}>{h.name}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const assigned = assignments[item.userId]
          const assignedHouse = houses.find(h => h.id === assigned)
          return (
            <View style={styles.memberRow}>
              <Avatar name={item.user.name} photoUrl={item.user.profilePhotoUrl} size={36} />
              <Text style={styles.memberName}>{item.user.name}</Text>
              <View style={styles.houseChips}>
                {houses.map(h => (
                  <TouchableOpacity
                    key={h.id}
                    style={[styles.houseChip, assigned === h.id && { backgroundColor: h.color ?? '#1a56db', borderColor: h.color ?? '#1a56db' }]}
                    onPress={() => assigned === h.id ? clearHouse(item.userId) : assignHouse(item.userId, h.id)}
                  >
                    <Text style={[styles.houseChipText, assigned === h.id && styles.houseChipTextSelected]}>{h.name.charAt(0)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )
        }}
      />

      <View style={styles.footer}>
        <Button title={`Save Assignments (${Object.keys(assignments).length})`} onPress={handleSave} loading={saving} />
      </View>
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
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280' },
  warningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  warningText: { fontSize: 13, color: '#92400e' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  houseDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: '#374151' },
  list: { padding: 12, paddingBottom: 100 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  memberName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  houseChips: { flexDirection: 'row', gap: 6 },
  houseChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  houseChipText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  houseChipTextSelected: { color: '#fff' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },
})
