import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import CalendarPicker from 'react-native-calendar-picker'
import { unavailabilityApi, UnavailabilityRule, matchApi, MatchSummary } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type SubTab = 'upcoming' | 'dates' | 'recurring'

export default function AvailabilityScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()
  const [subTab, setSubTab] = useState<SubTab>('upcoming')

  // Upcoming confirmed matches
  const [upcomingMatches, setUpcomingMatches] = useState<MatchSummary[]>([])

  // Unavailability rules
  const [rules, setRules] = useState<UnavailabilityRule[]>([])

  // Specific date selection
  const [selectedDates, setSelectedDates] = useState<Date[]>([])

  // Recurring weekly
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [weeksAhead, setWeeksAhead] = useState(4)

  const [saving, setSaving] = useState(false)

  const loadRules = useCallback(async () => {
    try {
      const { rules: r } = await unavailabilityApi.list(activeClubId ?? undefined)
      setRules(r)
    } catch {}
  }, [activeClubId])

  const loadMatches = useCallback(async () => {
    if (!activeClubId) return
    try {
      const { matches } = await matchApi.list(activeClubId)
      setUpcomingMatches(
        matches.filter((m) => m.myStatus === 'CONFIRMED' || m.myStatus === 'WAITLISTED'),
      )
    } catch {}
  }, [activeClubId])

  useEffect(() => {
    loadRules()
    loadMatches()
  }, [loadRules, loadMatches])

  async function saveSpecificDates() {
    if (selectedDates.length === 0) return
    setSaving(true)
    try {
      await Promise.all(
        selectedDates.map((d) =>
          unavailabilityApi.create({
            clubId: activeClubId ?? undefined,
            type: 'SPECIFIC_DATE',
            date: d.toISOString(),
          }),
        ),
      )
      setSelectedDates([])
      await loadRules()
      Alert.alert('Saved', 'Unavailability dates saved.')
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function saveRecurring() {
    if (selectedDays.length === 0) return
    setSaving(true)
    try {
      await Promise.all(
        selectedDays.map((day) =>
          unavailabilityApi.create({
            clubId: activeClubId ?? undefined,
            type: 'RECURRING_WEEKLY',
            dayOfWeek: day,
            startFrom: new Date().toISOString(),
            weeksAhead,
          }),
        ),
      )
      setSelectedDays([])
      await loadRules()
      Alert.alert('Saved', 'Recurring unavailability saved.')
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRule(id: string) {
    try {
      await unavailabilityApi.delete(id)
      await loadRules()
    } catch {
      Alert.alert('Error', 'Failed to delete rule')
    }
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  function handleDateSelect(date: Date) {
    const iso = date.toDateString()
    setSelectedDates((prev) => {
      const existing = prev.find((d) => d.toDateString() === iso)
      return existing ? prev.filter((d) => d.toDateString() !== iso) : [...prev, date]
    })
  }

  const specificRules = rules.filter((r) => r.type === 'SPECIFIC_DATE')
  const recurringRules = rules.filter((r) => r.type === 'RECURRING_WEEKLY')

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Availability</Text>
      </View>

      <View style={styles.subTabs}>
        {(['upcoming', 'dates', 'recurring'] as SubTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.subTab, subTab === t && styles.subTabActive]}
            onPress={() => setSubTab(t)}
          >
            <Text style={[styles.subTabText, subTab === t && styles.subTabTextActive]}>
              {t === 'upcoming' ? 'My Matches' : t === 'dates' ? 'Block Dates' : 'Recurring'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Upcoming confirmed matches */}
        {subTab === 'upcoming' && (
          <>
            <Text style={styles.sectionTitle}>My Upcoming Matches</Text>
            {upcomingMatches.length === 0 ? (
              <Text style={styles.emptyText}>No confirmed or waitlisted matches.</Text>
            ) : (
              upcomingMatches.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.matchRow}
                  onPress={() => router.push(`/(app)/match/${m.id}` as never)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchTitle}>{m.title}</Text>
                    <Text style={styles.matchMeta}>
                      {new Date(m.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.matchBadges}>
                    {m.hasFeeDue && <Text>💰</Text>}
                    <Badge
                      label={m.myStatus === 'CONFIRMED' ? 'Confirmed' : 'Waitlisted'}
                      variant={m.myStatus === 'CONFIRMED' ? 'green' : 'yellow'}
                    />
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* Block specific dates */}
        {subTab === 'dates' && (
          <>
            <Text style={styles.sectionTitle}>Block Specific Dates</Text>
            <Text style={styles.hint}>Tap dates on the calendar to mark yourself unavailable.</Text>

            <CalendarPicker
              onDateChange={handleDateSelect}
              minDate={new Date()}
              selectedDayColor="#1a56db"
              selectedDayTextColor="#fff"
              todayBackgroundColor="#e8f0fe"
            />

            {selectedDates.length > 0 && (
              <View style={styles.selectedDates}>
                <Text style={styles.selectedLabel}>Selected: {selectedDates.length} date(s)</Text>
                <Button title="Save" size="sm" onPress={saveSpecificDates} loading={saving} />
              </View>
            )}

            {specificRules.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Blocked Dates</Text>
                {specificRules.map((r) => (
                  <View key={r.id} style={styles.ruleRow}>
                    <Text style={styles.ruleText}>
                      {r.date ? new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </Text>
                    <TouchableOpacity onPress={() => deleteRule(r.id)}>
                      <Ionicons name="close-circle-outline" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* Recurring weekly */}
        {subTab === 'recurring' && (
          <>
            <Text style={styles.sectionTitle}>Recurring Unavailability</Text>
            <Text style={styles.hint}>Select days of the week you're unavailable.</Text>

            <View style={styles.daysRow}>
              {DAY_LABELS.map((day, i) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayChip, selectedDays.includes(i) && styles.dayChipSelected]}
                  onPress={() => toggleDay(i)}
                >
                  <Text style={[styles.dayText, selectedDays.includes(i) && styles.dayTextSelected]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.weeksRow}>
              <Text style={styles.label}>For the next</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setWeeksAhead((v) => Math.max(1, v - 1))}>
                  <Text style={styles.stepText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepValue}>{weeksAhead}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setWeeksAhead((v) => Math.min(12, v + 1))}>
                  <Text style={styles.stepText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>weeks</Text>
            </View>

            {selectedDays.length > 0 && (
              <Button title="Save Recurring" onPress={saveRecurring} loading={saving} style={{ marginTop: 8 }} />
            )}

            {recurringRules.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Active Rules</Text>
                {recurringRules.map((r) => (
                  <View key={r.id} style={styles.ruleRow}>
                    <Text style={styles.ruleText}>
                      Every {DAY_LABELS[r.dayOfWeek ?? 0]} · {r.weeksAhead} weeks
                    </Text>
                    <TouchableOpacity onPress={() => deleteRule(r.id)}>
                      <Ionicons name="close-circle-outline" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  subTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6' },
  subTabActive: { backgroundColor: '#1a56db' },
  subTabText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  subTabTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingTop: 24 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  matchTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  matchMeta: { fontSize: 12, color: '#6b7280' },
  matchBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  selectedDates: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  selectedLabel: { fontSize: 13, color: '#374151' },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  ruleText: { fontSize: 14, color: '#374151' },
  daysRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  dayChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  dayChipSelected: { backgroundColor: '#1a56db' },
  dayText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  dayTextSelected: { color: '#fff' },
  weeksRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  label: { fontSize: 14, color: '#374151' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  stepBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f9fafb' },
  stepText: { fontSize: 18, color: '#374151', fontWeight: '600' },
  stepValue: { paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: '#111827' },
})
