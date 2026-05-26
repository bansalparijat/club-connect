import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { matchApi, MatchDetail } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

type Tab = 'confirmed' | 'waitlisted' | 'unavailable'

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()

  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [feeLoading, setFeeLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('confirmed')

  const load = useCallback(async () => {
    try {
      const data = await matchApi.get(id)
      setDetail(data)
    } catch {
      router.back()
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleAvailability(status: 'AVAILABLE' | 'UNAVAILABLE') {
    if (!detail) return
    setActionLoading(true)
    try {
      if (detail.myStatus === null) {
        await matchApi.markAvailability(id, status)
      } else {
        const newStatus = status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DROPPED'
        await matchApi.updateAvailability(id, { status: newStatus })
      }
      await load()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update availability')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDropOut() {
    Alert.alert(
      'Drop out?',
      'The next waitlisted player will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Drop Out',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true)
            try {
              await matchApi.updateAvailability(id, { status: 'DROPPED' })
              await load()
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ],
    )
  }

  async function handleMarkFeePaid() {
    setFeeLoading(true)
    try {
      await matchApi.markFeePaid(id)
      await load()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark fee as paid')
    } finally {
      setFeeLoading(false)
    }
  }

  async function handleCancelMatch() {
    Alert.alert(
      'Cancel Match?',
      'All confirmed and waitlisted members will be notified.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Match',
          style: 'destructive',
          onPress: async () => {
            try {
              await matchApi.cancel(id)
              router.back()
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
            }
          },
        },
      ],
    )
  }

  if (loading || !detail) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#1a56db" />
      </SafeAreaView>
    )
  }

  const { match, parameters, houses, availability, myStatus, fee, captains } = detail
  const isOpen = match.status === 'OPEN'
  const isAdmin = false // TODO: wire from club store
  const isCaptain = captains.some((c) => c.id === user?.id)
  const canManage = isAdmin || isCaptain

  const myStatusLabel =
    myStatus === 'CONFIRMED' ? 'Confirmed'
    : myStatus === 'WAITLISTED' ? `Waitlisted`
    : myStatus === 'UNAVAILABLE' ? 'Unavailable'
    : myStatus === 'DROPPED' ? 'Dropped'
    : null

  const waitlistPosition = myStatus === 'WAITLISTED'
    ? availability.waitlisted.findIndex((w) => w.user.id === user?.id) + 1
    : null

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav header */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{match.title}</Text>
        {canManage && (
          <TouchableOpacity onPress={handleCancelMatch}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#374151" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status badge */}
        {match.status !== 'OPEN' && (
          <Badge
            label={match.status}
            variant={match.status === 'CANCELLED' ? 'red' : 'gray'}
          />
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.infoRow}>📅 {formatDate(match.date)} at {formatTime(match.date)}</Text>
          <Text style={styles.infoRow}>📍 {match.venue}</Text>
          {houses.length > 0 && (
            <Text style={styles.infoRow}>🏠 {houses.map((h) => h.name).join(' vs ')}</Text>
          )}
          <Text style={styles.infoRow}>
            👥 {availability.confirmed.length}/{match.capacity} confirmed
            {availability.waitlisted.length > 0 ? ` · ${availability.waitlisted.length} waitlisted` : ''}
          </Text>
        </View>

        {/* Match parameters */}
        {parameters.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Match Details</Text>
            <View style={styles.paramsGrid}>
              {parameters.map((p) => (
                <View key={p.key} style={styles.paramChip}>
                  <Text style={styles.paramKey}>{p.key}</Text>
                  <Text style={styles.paramValue}>{p.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* My Availability */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Availability</Text>

          {myStatus === 'CONFIRMED' && (
            <View style={styles.statusRow}>
              <Badge label="You're confirmed" variant="green" />
              {isOpen && (
                <Button
                  title="Drop Out"
                  variant="danger"
                  size="sm"
                  onPress={handleDropOut}
                  loading={actionLoading}
                  style={styles.dropBtn}
                />
              )}
            </View>
          )}

          {myStatus === 'WAITLISTED' && waitlistPosition !== null && (
            <View style={styles.statusRow}>
              <Badge label={`#${waitlistPosition} on waitlist`} variant="yellow" />
              {isOpen && (
                <Button
                  title="Drop Out"
                  variant="danger"
                  size="sm"
                  onPress={handleDropOut}
                  loading={actionLoading}
                  style={styles.dropBtn}
                />
              )}
            </View>
          )}

          {myStatus === 'UNAVAILABLE' && (
            <Badge label="Unavailable" variant="red" />
          )}

          {myStatus === 'DROPPED' && (
            <Badge label="Dropped" variant="gray" />
          )}

          {isOpen && (
            <View style={styles.availButtons}>
              <Button
                title="Available"
                variant={myStatus === 'CONFIRMED' || myStatus === 'WAITLISTED' ? 'secondary' : 'primary'}
                size="sm"
                onPress={() => handleAvailability('AVAILABLE')}
                loading={actionLoading}
                disabled={myStatus === 'CONFIRMED' || myStatus === 'WAITLISTED'}
                style={{ flex: 1 }}
              />
              <Button
                title="Unavailable"
                variant={myStatus === 'UNAVAILABLE' ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => handleAvailability('UNAVAILABLE')}
                loading={actionLoading}
                disabled={myStatus === 'UNAVAILABLE'}
                style={{ flex: 1 }}
              />
            </View>
          )}

          {!isOpen && (
            <Text style={styles.closedNote}>
              {match.status === 'CANCELLED' ? 'This match has been cancelled.' : 'Availability is closed.'}
            </Text>
          )}
        </View>

        {/* Fee */}
        {fee && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Match Fee</Text>
            <View style={styles.feeRow}>
              <Text style={styles.feeAmount}>{fee.currency} {fee.amount}</Text>
              {fee.myMarkedPaid ? (
                <Badge label="Paid" variant="green" />
              ) : myStatus === 'CONFIRMED' ? (
                <Button
                  title="Mark as Paid"
                  size="sm"
                  onPress={handleMarkFeePaid}
                  loading={feeLoading}
                />
              ) : (
                <Badge label="Not applicable" variant="gray" />
              )}
            </View>
          </View>
        )}

        {/* Player list tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players</Text>
          <View style={styles.tabs}>
            {(['confirmed', 'waitlisted', 'unavailable'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)} (
                  {t === 'confirmed'
                    ? availability.confirmed.length
                    : t === 'waitlisted'
                    ? availability.waitlisted.length
                    : availability.unavailable.length}
                  )
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'confirmed' && availability.confirmed.map((a, i) => {
            const isCap = captains.some((c) => c.id === a.user.id)
            return (
              <View key={a.user.id} style={styles.playerRow}>
                <Text style={styles.playerNum}>{i + 1}</Text>
                <Avatar name={a.user.name} photoUrl={a.user.profilePhotoUrl} size={32} />
                <Text style={styles.playerName}>{a.user.name}</Text>
                {isCap && <Badge label="C" variant="blue" />}
              </View>
            )
          })}

          {tab === 'waitlisted' && availability.waitlisted.map((a) => (
            <View key={a.user.id} style={styles.playerRow}>
              <Text style={styles.playerNum}>#{a.position}</Text>
              <Avatar name={a.user.name} photoUrl={a.user.profilePhotoUrl} size={32} />
              <Text style={styles.playerName}>{a.user.name}</Text>
            </View>
          ))}

          {tab === 'unavailable' && availability.unavailable.map((a) => (
            <View key={a.user.id} style={styles.playerRow}>
              <Avatar name={a.user.name} photoUrl={a.user.profilePhotoUrl} size={32} />
              <Text style={styles.playerName}>{a.user.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  navTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' },
  content: { padding: 16, paddingBottom: 40 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  infoRow: { fontSize: 14, color: '#374151', marginBottom: 6 },
  paramsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paramChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paramKey: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  paramValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dropBtn: { marginLeft: 8 },
  availButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  closedNote: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feeAmount: { fontSize: 18, fontWeight: '700', color: '#111827' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  tabBtnActive: { backgroundColor: '#1a56db' },
  tabText: { fontSize: 12, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  playerNum: { fontSize: 12, color: '#9ca3af', width: 20, textAlign: 'center' },
  playerName: { flex: 1, fontSize: 14, color: '#111827' },
})
