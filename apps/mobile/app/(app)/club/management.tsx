import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useClubStore } from '@/store/club'

type MenuItem = {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  route: string
}

const MENU: MenuItem[] = [
  { label: 'Members', icon: 'people-outline', route: '/(app)/club/members' },
  { label: 'Houses', icon: 'home-outline', route: '/(app)/club/houses' },
  { label: 'Seasons', icon: 'calendar-outline', route: '/(app)/club/seasons' },
  { label: 'Club Settings', icon: 'settings-outline', route: '/(app)/club/settings' },
]

export default function ClubManagementScreen() {
  const router = useRouter()
  const { activeClub } = useClubStore()
  const club = activeClub()

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Club</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {club && (
          <View style={styles.clubBanner}>
            <Text style={styles.clubName}>{club.name}</Text>
            <Text style={styles.clubMeta}>{club.memberCount} members</Text>
          </View>
        )}

        {MENU.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuRow}
            onPress={() => router.push(item.route as never)}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={20} color="#1a56db" />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>
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
  content: { padding: 16 },
  clubBanner: {
    backgroundColor: '#1a56db',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  clubName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  clubMeta: { fontSize: 13, color: '#bfdbfe' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#111827' },
})
