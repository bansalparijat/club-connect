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
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [hasEndDate, setHasEndDate] = useState(false)
  const [showStart, setShowStart] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
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

  function openCreate() {
    setSeasonName('')
    setStartDate(new Date())
    setEndDate(null)
    setHasEndDate(false)
    setNameError('')
    setModalVisible(true)
  }

  async function handleCreate() {
    if (!seasonName.trim()) { setNameError('Name is required'); return }
    setSaving(true)
    try {
      await clubApi.createSeason(activeClubId!, {
        name: seasonName.trim(),
        startDate: startDate.toISOString(),
        ...(hasEndDate && endDate ? { endDate: endDate.toISOString() } : {}),
      })
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

  async function handleMarkEnded(season: Season) {
    Alert.alert(
      'End Season?',
      `"${season.name}" will be marked as ended and deactivated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Season',
          style: 'destructive',
          onPress: async () => {
            try {
              await clubApi.updateSeason(activeClubId!, season.id, { isEnded: true })
              await load()
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
            }
          },
        },
      ],
    )
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function getStatusBadge(season: Season) {
    if (season.isEnded) return <Badge label="Ended" variant="red" />
    if (season.isActive) return <Badge label="Active" variant="green" />
    return null
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Seasons</Text>
        <TouchableOpacity onPress={openCreate}>
          <Ionicons name="add" size={26} color="#1a56db" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={seasons}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.seasonRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.seasonName}>{item.name}</Text>
                {getStatusBadge(item)}
              </View>
              <Text style={styles.seasonDates}>
                {formatDate(item.startDate)}
                {item.endDate ? ` → ${formatDate(item.endDate)}` : ' (ongoing)'}
              </Text>
            </View>
            <View style={styles.actions}>
              {!item.isActive && !item.isEnded && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleSetActive(item)}>
                  <Text style={styles.setActiveText}>Set Active</Text>
                </TouchableOpacity>
              )}
              {!item.isEnded && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkEnded(item)}>
                  <Ionicons name="stop-circle-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
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

          <TouchableOpacity
            style={styles.endDateToggle}
            onPress={() => {
              setHasEndDate(!hasEndDate)
              if (!hasEndDate && !endDate) setEndDate(new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000))
            }}
          >
            <Ionicons
              name={hasEndDate ? 'checkbox' : 'square-outline'}
              size={20}
              color={hasEndDate ? '#1a56db' : '#9ca3af'}
            />
            <Text style={styles.endDateToggleText}>Set end date</Text>
          </TouchableOpacity>

          {hasEndDate && endDate && (
            <>
              <Text style={styles.dateLabel}>End Date</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEnd(true)}>
                <Text style={styles.dateBtnText}>
                  {endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#6b7280" />
              </TouchableOpacity>
              {showEnd && (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={startDate}
                  onChange={(_, d) => { setShowEnd(false); if (d) setEndDate(d) }}
                />
              )}
            </>
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { padding: 4 },
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
    marginBottom: 12,
  },
  dateBtnText: { fontSize: 15, color: '#111827' },
  endDateToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  endDateToggleText: { fontSize: 14, color: '#374151' },
})
