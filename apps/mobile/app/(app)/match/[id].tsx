import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { matchApi, MatchDetail, PlayerHouse } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { useClubStore } from '@/store/club'
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

function HouseDot({ house }: { house: PlayerHouse | null }) {
  if (!house) return null
  if (house.color) return <View style={[styles.houseDot, { backgroundColor: house.color }]} />
  return <Text style={styles.houseTag}>{house.name.charAt(0)}</Text>
}

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const { activeClub } = useClubStore()
  const club = activeClub()

  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [feeLoading, setFeeLoading] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('confirmed')
  const [showMenu, setShowMenu] = useState(false)

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

  const isAdmin = club?.myRole === 'ADMIN'

  async function handleAvailability(status: 'AVAILABLE' | 'UNAVAILABLE') {
    if (!detail) return
    setActionLoading(true)
    try {
      // Always use POST for self-availability changes.
      // POST handles all transitions correctly:
      //   AVAILABLE → CONFIRMED or WAITLISTED (regardless of prior status)
      //   UNAVAILABLE → releases any held slot, then marks unavailable
      await matchApi.markAvailability(id, status)
      await load()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update availability')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDropOut() {
    Alert.alert('Drop out?', 'The next waitlisted player will be notified.', [
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
    ])
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

  async function handleMarkComplete() {
    Alert.alert('Mark Match Complete?', 'No further changes will be allowed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Complete',
        onPress: async () => {
          setCompleteLoading(true)
          try {
            await matchApi.update(id, { status: 'CLOSED' })
            await load()
          } catch (err: unknown) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
          } finally {
            setCompleteLoading(false)
          }
        },
      },
    ])
  }

  async function handleCancelMatch() {
    Alert.alert('Cancel Match?', 'All confirmed and waitlisted members will be notified.', [
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
    ])
  }

  function handleEdit() {
    if (!detail) return
    const { match } = detail
    router.push({
      pathname: '/(app)/match/edit',
      params: {
        id: match.id,
        title: match.title,
        date: match.date,
        venue: match.venue,
        capacity: String(match.capacity),
        waitlistSize: String(match.waitlistSize),
        feeAmount: match.feeAmount ?? 'null',
      },
    } as never)
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
  const isClosed = match.status === 'CLOSED'
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
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{match.title}</Text>
        {isAdmin && !isClosed && match.status !== 'CANCELLED' && (
          <TouchableOpacity onPress={() => setShowMenu(true)}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#374151" />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowMenu(false)}>
          <Pressable style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{match.title}</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); handleEdit() }}>
              <Ionicons name="pencil-outline" size={20} color="#374151" />
              <Text style={styles.menuItemText}>Edit Match</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); handleMarkComplete() }}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#374151" />
              <Text style={styles.menuItemText}>Mark Complete</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); handleCancelMatch() }}>
              <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Cancel Match</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status badge */}
        {match.status !== 'OPEN' && (
          <View style={{ marginBottom: 8 }}>
            <Badge
              label={match.status === 'CLOSED' ? 'Completed' : match.status}
              variant={match.status === 'CANCELLED' ? 'red' : match.status === 'CLOSED' ? 'blue' : 'gray'}
            />
          </View>
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

        {/* Admin quick actions */}
        {isAdmin && isOpen && (
          <View style={styles.adminActions}>
            <TouchableOpacity style={styles.adminBtn} onPress={handleEdit}>
              <Ionicons name="pencil-outline" size={16} color="#1a56db" />
              <Text style={styles.adminBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.adminBtn, styles.adminBtnComplete]} onPress={handleMarkComplete} disabled={completeLoading}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={[styles.adminBtnText, { color: '#fff' }]}>Mark Complete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* My Availability */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Availability</Text>

          {myStatus === 'CONFIRMED' && (
            <View style={styles.statusRow}>
              <Badge label="You're confirmed" variant="green" />
              {isOpen && (
                <Button title="Drop Out" variant="danger" size="sm" onPress={handleDropOut} loading={actionLoading} style={styles.dropBtn} />
              )}
            </View>
          )}

          {myStatus === 'WAITLISTED' && waitlistPosition !== null && (
            <View style={styles.statusRow}>
              <Badge label={`#${waitlistPosition} on waitlist`} variant="yellow" />
              {isOpen && (
                <Button title="Drop Out" variant="danger" size="sm" onPress={handleDropOut} loading={actionLoading} style={styles.dropBtn} />
              )}
            </View>
          )}

          {myStatus === 'UNAVAILABLE' && <Badge label="Unavailable" variant="red" />}
          {myStatus === 'DROPPED' && <Badge label="Dropped" variant="gray" />}

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
              {match.status === 'CANCELLED' ? 'This match has been cancelled.'
               : match.status === 'CLOSED' ? 'This match is completed.'
               : 'Availability is closed.'}
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
                <Button title="Mark as Paid" size="sm" onPress={handleMarkFeePaid} loading={feeLoading} />
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
                  {t === 'confirmed' ? availability.confirmed.length
                   : t === 'waitlisted' ? availability.waitlisted.length
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
                <HouseDot house={a.house} />
                {fee && (
                  <Ionicons
                    name={a.hasPaid ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={a.hasPaid ? '#16a34a' : '#d1d5db'}
                  />
                )}
              </View>
            )
          })}

          {tab === 'waitlisted' && availability.waitlisted.map((a) => (
            <View key={a.user.id} style={styles.playerRow}>
              <Text style={styles.playerNum}>#{a.position}</Text>
              <Avatar name={a.user.name} photoUrl={a.user.profilePhotoUrl} size={32} />
              <Text style={styles.playerName}>{a.user.name}</Text>
              <HouseDot house={a.house} />
              {fee && (
                <Ionicons
                  name={a.hasPaid ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={a.hasPaid ? '#16a34a' : '#d1d5db'}
                />
              )}
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
  paramChip: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  paramKey: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  paramValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  adminActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  adminBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a56db',
    backgroundColor: '#fff',
  },
  adminBtnComplete: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  adminBtnText: { fontSize: 13, fontWeight: '600', color: '#1a56db' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dropBtn: { marginLeft: 8 },
  availButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  closedNote: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feeAmount: { fontSize: 18, fontWeight: '700', color: '#111827' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6' },
  tabBtnActive: { backgroundColor: '#1a56db' },
  tabText: { fontSize: 12, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  playerNum: { fontSize: 12, color: '#9ca3af', width: 20, textAlign: 'center' },
  playerName: { flex: 1, fontSize: 14, color: '#111827' },
  houseDot: { width: 12, height: 12, borderRadius: 6 },
  houseTag: { fontSize: 10, fontWeight: '700', color: '#6b7280', backgroundColor: '#f3f4f6', width: 18, height: 18, borderRadius: 9, textAlign: 'center', lineHeight: 18 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  menuTitle: { fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 12, textAlign: 'center' },
  menuDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  menuItemText: { fontSize: 16, color: '#111827' },
})
