import React, { useState } from 'react'
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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { matchApi } from '@/api/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function EditMatchScreen() {
  const router = useRouter()
  const { id, title: initTitle, date: initDate, venue: initVenue, capacity: initCapacity, waitlistSize: initWaitlist, feeAmount: initFee } =
    useLocalSearchParams<{
      id: string; title: string; date: string; venue: string;
      capacity: string; waitlistSize: string; feeAmount: string
    }>()

  const [title, setTitle] = useState(initTitle ?? '')
  const [venue, setVenue] = useState(initVenue ?? '')
  const [date, setDate] = useState(initDate ? new Date(initDate) : new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [capacity, setCapacity] = useState(Number(initCapacity ?? 11))
  const [waitlistSize, setWaitlistSize] = useState(Number(initWaitlist ?? 0))
  const [hasFee, setHasFee] = useState(!!initFee && initFee !== 'null')
  const [feeAmount, setFeeAmount] = useState(initFee && initFee !== 'null' ? initFee : '')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function formatDateDisplay(d: Date) {
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatTimeDisplay(d: Date) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  async function handleSave() {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (!venue.trim()) errs.venue = 'Venue is required'
    if (hasFee && (!feeAmount || isNaN(Number(feeAmount)))) errs.fee = 'Enter a valid fee amount'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      await matchApi.update(id, {
        title: title.trim(),
        venue: venue.trim(),
        date: date.toISOString(),
        capacity,
        waitlistSize,
        ...(hasFee && feeAmount ? { feeAmount: Number(feeAmount) } : { feeAmount: null }),
      } as Parameters<typeof matchApi.update>[1])
      router.back()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Match</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Sunday Friendly" error={errors.title} />
        <Input label="Venue" value={venue} onChangeText={setVenue} placeholder="e.g. City Ground" error={errors.venue} />

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
            onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(prev => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n }) }}
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
            onChange={(_, d) => { setShowTimePicker(false); if (d) setDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n }) }}
          />
        )}

        {/* Capacity / Waitlist */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Capacity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setCapacity(v => Math.max(1, v - 1))}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{capacity}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setCapacity(v => v + 1)}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.field, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.label}>Waitlist</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setWaitlistSize(v => Math.max(0, v - 1))}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{waitlistSize}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setWaitlistSize(v => v + 1)}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
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

        <Button title="Save Changes" onPress={handleSave} loading={loading} style={{ marginTop: 8 }} />
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
  feeToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
})
