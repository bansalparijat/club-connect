import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { clubApi, Member } from '@/api/client'
import { useClubStore } from '@/store/club'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

type StatusFilter = 'ALL' | 'ACTIVE' | 'INVITED' | 'SUSPENDED'

export default function MemberListScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('ACTIVE')
  const [_loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [menuMember, setMenuMember] = useState<Member | null>(null)

  const load = useCallback(async () => {
    if (!activeClubId) return
    setLoading(true)
    try {
      const { members: data, total: t } = await clubApi.getMembers(activeClubId, {
        status: filter === 'ALL' ? undefined : filter,
        search: search || undefined,
        limit: 100,
      })
      setMembers(data)
      setTotal(t)
    } catch {} finally {
      setLoading(false)
    }
  }, [activeClubId, filter, search])

  useEffect(() => { load() }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleChangeRole(member: Member) {
    if (member.role === 'ADMIN' && member.userId === currentUserId) {
      Alert.alert('Cannot Remove Yourself', 'You cannot remove your own admin privileges.')
      return
    }
    const newRole = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'
    Alert.alert(
      newRole === 'ADMIN' ? 'Make Admin?' : 'Remove Admin?',
      `${member.user.name} will ${newRole === 'ADMIN' ? 'gain admin privileges' : 'lose admin privileges'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await clubApi.updateMember(activeClubId!, member.userId, { role: newRole })
              await load()
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
            }
          },
        },
      ],
    )
  }

  async function handleRemove(member: Member) {
    Alert.alert('Remove member?', `${member.user.name} will lose access to this club.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await clubApi.removeMember(activeClubId!, member.userId)
            await load()
          } catch (err: unknown) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed')
          }
        },
      },
    ])
  }

  const FILTERS: StatusFilter[] = ['ACTIVE', 'ALL', 'INVITED', 'SUSPENDED']

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Members ({total})</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/club/add-member' as never)}>
          <Ionicons name="person-add-outline" size={22} color="#1a56db" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or phone..."
          placeholderTextColor="#9ca3af"
          returnKeyType="search"
          onSubmitEditing={() => load()}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={menuMember !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMember(null)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuMember(null)}>
          <Pressable style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuMember?.user.name}</Text>
            {menuMember && menuMember.role !== 'ADMIN' && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuMember(null); handleChangeRole(menuMember) }}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#374151" />
                <Text style={styles.menuItemText}>Make Admin</Text>
              </TouchableOpacity>
            )}
            {menuMember && menuMember.role === 'ADMIN' && menuMember.userId !== currentUserId && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuMember(null); handleChangeRole(menuMember) }}>
                <Ionicons name="shield-outline" size={20} color="#374151" />
                <Text style={styles.menuItemText}>Remove Admin</Text>
              </TouchableOpacity>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuMember(null); handleRemove(menuMember!) }}>
              <Ionicons name="person-remove-outline" size={20} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Remove from Club</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Avatar name={item.user.name} photoUrl={item.user.profilePhotoUrl} size={40} />
            <View style={styles.memberInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.memberName}>{item.user.name}</Text>
                {item.role === 'ADMIN' && <Badge label="Admin" variant="blue" />}
              </View>
              <Text style={styles.memberPhone}>{item.user.phone}</Text>
              {item.house && <Text style={styles.memberHouse}>🏠 {item.house.name}</Text>}
            </View>
            <TouchableOpacity style={styles.moreBtn} onPress={() => setMenuMember(item)}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footerBtns}>
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => router.push('/(app)/club/import' as never)}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#1a56db" />
              <Text style={styles.importText}>Bulk Import Members</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => router.push('/(app)/club/bulk-houses' as never)}
            >
              <Ionicons name="grid-outline" size={18} color="#1a56db" />
              <Text style={styles.importText}>Assign Houses in Bulk</Text>
            </TouchableOpacity>
          </View>
        }
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  filterChipActive: { backgroundColor: '#1a56db' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#fff' },
  list: { paddingHorizontal: 12, paddingBottom: 40 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  memberInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  memberPhone: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  memberHouse: { fontSize: 12, color: '#6b7280' },
  moreBtn: { padding: 4 },
  footerBtns: { gap: 4 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  importText: { fontSize: 14, color: '#1a56db', fontWeight: '500' },
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
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuItemText: { fontSize: 16, color: '#111827' },
})
