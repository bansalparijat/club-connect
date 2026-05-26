import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { matchApi, clubApi, sportTypesApi, House, SportParameter } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

type CustomParam = { key: string; value: string }

export default function CreateMatchScreen() {
  const router = useRouter()
  const { activeClubId, activeClub } = useClubStore()
  const club = activeClub()

  const [title, setTitle] = useState('')
  const [venue, setVenue] = useState('')
  const [date, setDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [capacity, setCapacity] = useState(11)
  const [waitlistSize, setWaitlistSize] = useState(0)
  const [hasFee, setHasFee] = useState(false)
  const [feeAmount, setFeeAmount] = useState('')

  const [houses, setHouses] = useState<House[]>([])
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([])
  const [sportParams, setSportParams] = useState<SportParameter[]>([])
  const [sportParamValues, setSportParamValues] = useState<Record<string, string>>({})
  const [customParams, setCustomParams] = useState<CustomParam[]>([])

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!activeClubId) return
    clubApi.getHouses(activeClubId).then(({ houses: h }) => setHouses(h)).catch(() => {})
    if (club?.sportTypeId) {
      sportTypesApi.list().then(({ sportTypes }) => {
        const st = sportTypes.find((s) => s.id === club.sportTypeId)
        if (st) setSportParams(st.parameters.sort((a, b) => a.displayOrder - b.displayOrder))
      }).catch(() => {})
    }
  }, [activeClubId, club?.sportTypeId])

  function toggleHouse(houseId: string) {
    setSelectedHouseIds((prev) =>
      prev.includes(houseId) ? prev.filter((id) => id !== houseId) : [...prev, houseId],
    )
  }

  function addCustomParam() {
    setCustomParams((prev) => [...prev, { key: '', value: '' }])
  }

  function updateCustomParam(index: number, field: 'key' | 'value', val: string) {
    setCustomParams((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)))
  }

  function removeCustomParam(index: number) {
    setCustomParams((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleCreate() {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (!venue.trim()) errs.venue = 'Venue is required'
    if (hasFee && (!feeAmount || isNaN(Number(feeAmount)))) errs.fee = 'Enter a valid fee amount'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      const parameters = [
        ...sportParams
          .filter((p) => sportParamValues[p.id])
          .map((p) => ({ key: p.name, value: sportParamValues[p.id], sportParamId: p.id })),
        ...customParams
          .filter((p) => p.key.trim() && p.value.trim())
          .map((p) => ({ key: p.key.trim(), value: p.value.trim(), isCustom: true })),
      ]

      await matchApi.create(activeClubId!, {
        title: title.trim(),
        date: date.toISOString(),
        venue: venue.trim(),
        capacity,
        waitlistSize,
        ...(hasFee && feeAmount ? { feeAmount: Number(feeAmount), feeCurrency: 'INR' } : {}),
        houseIds: selectedHouseIds,
        parameters,
      })
      router.back()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create match')
    } finally {
      setLoading(false)
    }
  }

  function formatDateDisplay(d: Date) {
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatTimeDisplay(d: Date) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Match</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Input
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Sunday Friendly"
          error={errors.title}
        />
        <Input
          label="Venue"
          value={venue}
          onChangeText={setVenue}
          placeholder="e.g. City Ground"
          error={errors.venue}
        />

        {/* Date */}
        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickerText}>{formatDateDisplay(date)}</Text>
            <Ionicons name="calendar-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={(_, d) => { setShowDatePicker(false); if (d) setDate((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n }) }}
          />
        )}

        {/* Time */}
        <View style={styles.field}>
          <Text style={styles.label}>Time</Text>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickerText}>{formatTimeDisplay(date)}</Text>
            <Ionicons name="time-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
        {showTimePicker && (
          <DateTimePicker
            value={date}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => { setShowTimePicker(false); if (d) setDate((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n }) }}
          />
        )}

        {/* Houses */}
        {houses.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>Houses Playing</Text>
            <View style={styles.chipsRow}>
              {houses.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.chip, selectedHouseIds.includes(h.id) && styles.chipSelected]}
                  onPress={() => toggleHouse(h.id)}
                >
                  <Text style={[styles.chipText, selectedHouseIds.includes(h.id) && styles.chipTextSelected]}>
                    {h.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Capacity / Waitlist */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Capacity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setCapacity((v) => Math.max(1, v - 1))}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{capacity}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setCapacity((v) => v + 1)}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.field, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.label}>Waitlist</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setWaitlistSize((v) => Math.max(0, v - 1))}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{waitlistSize}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setWaitlistSize((v) => v + 1)}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sport parameters */}
        {sportParams.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>Match Parameters</Text>
            {sportParams.map((p) => (
              <View key={p.id} style={{ marginBottom: 12 }}>
                {p.type === 'SELECT' && p.options ? (
                  <>
                    <Text style={styles.paramLabel}>{p.name}</Text>
                    <View style={styles.chipsRow}>
                      {p.options.map((opt) => (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.chip, sportParamValues[p.id] === opt && styles.chipSelected]}
                          onPress={() => setSportParamValues((prev) => ({ ...prev, [p.id]: opt }))}
                        >
                          <Text style={[styles.chipText, sportParamValues[p.id] === opt && styles.chipTextSelected]}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <Input
                    label={p.name}
                    value={sportParamValues[p.id] ?? ''}
                    onChangeText={(v) => setSportParamValues((prev) => ({ ...prev, [p.id]: v }))}
                    placeholder={`Enter ${p.name.toLowerCase()}`}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Custom params */}
        <View style={styles.field}>
          <Text style={styles.label}>Custom Parameters</Text>
          {customParams.map((p, i) => (
            <View key={i} style={styles.customParamRow}>
              <Input
                value={p.key}
                onChangeText={(v) => updateCustomParam(i, 'key', v)}
                placeholder="Label"
                style={{ flex: 1, marginBottom: 0 }}
              />
              <Input
                value={p.value}
                onChangeText={(v) => updateCustomParam(i, 'value', v)}
                placeholder="Value"
                style={{ flex: 1, marginHorizontal: 8, marginBottom: 0 }}
              />
              <TouchableOpacity onPress={() => removeCustomParam(i)}>
                <Ionicons name="close-circle" size={22} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addParamBtn} onPress={addCustomParam}>
            <Ionicons name="add" size={16} color="#1a56db" />
            <Text style={styles.addParamText}>Add Parameter</Text>
          </TouchableOpacity>
        </View>

        {/* Fee */}
        <View style={styles.feeToggleRow}>
          <Text style={styles.label}>Match Fee</Text>
          <Switch value={hasFee} onValueChange={setHasFee} trackColor={{ true: '#1a56db' }} />
        </View>
        {hasFee && (
          <Input
            label="Amount (INR)"
            value={feeAmount}
            onChangeText={setFeeAmount}
            keyboardType="numeric"
            placeholder="e.g. 200"
            error={errors.fee}
          />
        )}

        <Button title="Create Match" onPress={handleCreate} loading={loading} style={{ marginTop: 8 }} />
      </ScrollView>
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
  form: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  paramLabel: { fontSize: 13, color: '#374151', marginBottom: 6 },
  pickerBtn: {
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
  pickerText: { fontSize: 15, color: '#111827' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  stepBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#f9fafb' },
  stepText: { fontSize: 18, color: '#374151', fontWeight: '600' },
  stepValue: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#111827' },
  customParamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addParamBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  addParamText: { fontSize: 14, color: '#1a56db', fontWeight: '500' },
  feeToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
})
