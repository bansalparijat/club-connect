import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { clubApi, Season } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export default function SeasonManagementScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [seasonName, setSeasonName] = useState('')
  const [startDate, setStartDate] = useState(new Date())
  const [showStart, setShowStart] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  async function load() {
    if (!activeClubId) return
    try {
      const { seasons: s } = await clubApi.getSeasons(activeClubId)
      setSeasons(s)
    } catch {}
  }

  useEffect(() => { load() }, [activeClubId])

  async function handleCreate() {
    if (!seasonName.trim()) { setNameError('Name is required'); return }
    setSaving(true)
    try {
      await clubApi.createSeason(activeClubId!, { name: seasonName.trim(), startDate: startDate.toISOString() })
      setModalVisible(false)
      await load()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetActive(season: Season) {
    if (season.isActive) return
    Alert.alert('Set Active Season?', `"${season.name}" will become the active season.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Set Active',
        onPress: async () => {
          try {
            await clubApi.updateSeason(activeClubId!, season.id, { isActive: true })
            await load()
          } catch (err: unknown) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
          }
        },
      },
    ])
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Seasons</Text>
        <TouchableOpacity onPress={() => { setSeasonName(''); setStartDate(new Date()); setNameError(''); setModalVisible(true) }}>
          <Ionicons name="add" size={26} color="#1a56db" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={seasons}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.seasonRow} onPress={() => handleSetActive(item)}>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.seasonName}>{item.name}</Text>
                {item.isActive && <Badge label="Active" variant="green" />}
              </View>
              <Text style={styles.seasonDates}>
                {formatDate(item.startDate)}
                {item.endDate ? ` → ${formatDate(item.endDate)}` : ' (ongoing)'}
              </Text>
            </View>
            {!item.isActive && (
              <Text style={styles.setActiveText}>Set Active</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No seasons yet. Create one to track house memberships.</Text>
        }
      />

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>New Season</Text>

          <Input
            label="Season Name"
            value={seasonName}
            onChangeText={(v) => { setSeasonName(v); setNameError('') }}
            placeholder="e.g. Season 2025"
            error={nameError}
          />

          <Text style={styles.dateLabel}>Start Date</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStart(true)}>
            <Text style={styles.dateBtnText}>
              {startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
            <Ionicons name="calendar-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
          {showStart && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => { setShowStart(false); if (d) setStartDate(d) }}
            />
          )}

          <Button title="Create Season" onPress={handleCreate} loading={saving} style={{ marginTop: 16 }} />
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  list: { padding: 16 },
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  seasonName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  seasonDates: { fontSize: 12, color: '#6b7280' },
  setActiveText: { fontSize: 13, color: '#1a56db', fontWeight: '500' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingTop: 40, paddingHorizontal: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  handle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 20 },
  dateLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  dateBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  dateBtnText: { fontSize: 15, color: '#111827' },
})
