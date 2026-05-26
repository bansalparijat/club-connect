import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { userApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { useClubStore } from '@/store/club'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function MyProfileScreen() {
  const { user, updateUser, signOut } = useAuthStore()
  const { clubs } = useClubStore()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow Club Connect to access your photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri
      // In production: upload to Supabase Storage first, get URL, then update
      try {
        const { user: updated } = await userApi.updateMe({ profilePhotoUrl: uri })
        updateUser(updated)
      } catch {
        Alert.alert('Error', 'Failed to update photo')
      }
    }
  }

  async function handleSaveName() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const { user: updated } = await userApi.updateMe({ name: name.trim() })
      updateUser(updated)
      setEditingName(false)
    } catch {
      Alert.alert('Error', 'Failed to update name')
    } finally {
      setSaving(false)
    }
  }

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  if (!user) return null

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickPhoto}>
            <Avatar name={user.name} photoUrl={user.profilePhotoUrl} size={88} />
            <View style={styles.editPhotoOverlay}>
              <Text style={styles.editPhotoText}>Edit</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Name */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Name</Text>
            {!editingName && (
              <TouchableOpacity onPress={() => setEditingName(true)}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          {editingName ? (
            <View>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <View style={styles.editActions}>
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => { setEditingName(false); setName(user.name) }} />
                <Button title="Save" size="sm" onPress={handleSaveName} loading={saving} />
              </View>
            </View>
          ) : (
            <Text style={styles.cardValue}>{user.name}</Text>
          )}
        </View>

        {/* Phone */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Phone</Text>
          <Text style={styles.cardValue}>{user.phone}</Text>
        </View>

        {/* Clubs */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>My Clubs</Text>
          {clubs.length === 0 ? (
            <Text style={styles.noClubs}>Not a member of any club yet.</Text>
          ) : (
            clubs.map((club) => (
              <View key={club.id} style={styles.clubRow}>
                <Text style={styles.clubName}>{club.name}</Text>
                <Badge
                  label={club.myRole}
                  variant={club.myRole === 'ADMIN' ? 'blue' : 'gray'}
                />
              </View>
            ))
          )}
        </View>

        {/* Sign out */}
        <Button
          title="Sign Out"
          variant="danger"
          onPress={handleSignOut}
          style={styles.signOutBtn}
        />
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
  content: { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  editPhotoOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#1a56db',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editPhotoText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 16, color: '#111827' },
  editLink: { fontSize: 13, color: '#1a56db', fontWeight: '500' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  clubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  clubName: { fontSize: 15, color: '#111827' },
  noClubs: { fontSize: 14, color: '#9ca3af', paddingTop: 4 },
  signOutBtn: { marginTop: 8 },
})
