import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useClubStore } from '@/store/club'
import { Badge } from '@/components/ui/Badge'

type Props = {
  visible: boolean
  onClose: () => void
}

export function ClubSwitcherSheet({ visible, onClose }: Props) {
  const router = useRouter()
  const { clubs, activeClubId, setActiveClub } = useClubStore()

  function handleSelect(clubId: string) {
    setActiveClub(clubId)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Switch Club</Text>

        <FlatList
          data={clubs}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.clubRow, item.id === activeClubId && styles.clubRowActive]}
              onPress={() => handleSelect(item.id)}
            >
              <View style={styles.clubInfo}>
                <Text style={styles.clubName}>{item.name}</Text>
                <Badge
                  label={item.myRole}
                  variant={item.myRole === 'ADMIN' ? 'blue' : 'gray'}
                />
              </View>
              {item.id === activeClubId && (
                <Text style={styles.check}>✓</Text>
              )}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.createRow}
              onPress={() => {
                onClose()
                router.push('/(app)/club/create' as never)
              }}
            >
              <Text style={styles.createText}>+ Create a new club</Text>
            </TouchableOpacity>
          }
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  handle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 20, marginBottom: 8 },
  clubRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  clubRowActive: { backgroundColor: '#f0f4ff' },
  clubInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  clubName: { fontSize: 15, fontWeight: '500', color: '#111827' },
  check: { fontSize: 16, color: '#1a56db', fontWeight: '700' },
  createRow: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 8 },
  createText: { fontSize: 15, color: '#1a56db', fontWeight: '600' },
})
