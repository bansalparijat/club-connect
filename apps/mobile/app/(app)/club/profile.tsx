import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { clubApi } from '@/api/client'
import { useClubStore } from '@/store/club'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'

type Admin = { id: string; name: string; phone: string; profilePhotoUrl: string | null }

type ClubProfile = {
  id: string
  name: string
  description: string | null
  logoUrl: string | null
  sportType: { id: string; name: string }
  memberCount: number
  admins: Admin[]
  myMembership: { role: string }
}

export default function ClubProfileScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()
  const { user } = useAuthStore()

  const [profile, setProfile] = useState<ClubProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeClubId) return
    clubApi.get(activeClubId)
      .then(({ club, sportType, myMembership, memberCount, admins }: any) => {
        setProfile({ ...club, sportType, myMembership, memberCount, admins: admins ?? [] })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [activeClubId])

  const isAdmin = profile?.myMembership?.role === 'ADMIN'

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Club Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#1a56db" />
        </View>
      </SafeAreaView>
    )
  }

  if (!profile) return null

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Club Profile</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={() => router.push('/(app)/club/settings' as never)}>
            <Ionicons name="create-outline" size={22} color="#1a56db" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <Avatar name={profile.name} photoUrl={profile.logoUrl} size={88} />
          <Text style={styles.clubName}>{profile.name}</Text>
          <View style={styles.sportBadge}>
            <Text style={styles.sportBadgeText}>{profile.sportType.name}</Text>
          </View>
          {profile.description ? (
            <Text style={styles.description}>{profile.description}</Text>
          ) : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{profile.memberCount}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{profile.admins.length}</Text>
            <Text style={styles.statLabel}>Admins</Text>
          </View>
        </View>

        {/* Admins */}
        <Text style={styles.sectionTitle}>Admins</Text>
        {profile.admins.map((admin) => (
          <View key={admin.id} style={styles.adminRow}>
            <Avatar name={admin.name || admin.phone} photoUrl={admin.profilePhotoUrl} size={40} />
            <View style={styles.adminInfo}>
              <Text style={styles.adminName}>{admin.name || 'Unnamed'}</Text>
              <Text style={styles.adminPhone}>{admin.phone}</Text>
            </View>
            {admin.id === user?.id && (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>You</Text>
              </View>
            )}
          </View>
        ))}

        {/* Admin actions */}
        {isAdmin && (
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={() => router.push('/(app)/club/management' as never)}
          >
            <Ionicons name="settings-outline" size={18} color="#1a56db" />
            <Text style={styles.manageBtnText}>Manage Club</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: 24 },
  clubName: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 8 },
  sportBadge: {
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  sportBadgeText: { fontSize: 13, color: '#1a56db', fontWeight: '600' },
  description: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: '#f3f4f6' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  adminInfo: { flex: 1 },
  adminName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  adminPhone: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  youBadge: {
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  youBadgeText: { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 10,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1a56db' },
})
