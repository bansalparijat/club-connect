import React, { useState } from 'react'
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { userApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { useClubStore } from '@/store/club'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'

export default function ProfileSetupScreen() {
  const router = useRouter()
  const { user, updateUser } = useAuthStore()
  const loadClubs = useClubStore((s) => s.loadClubs)

  const [name, setName] = useState(user?.name ?? '')
  const [photoUrl, setPhotoUrl] = useState(user?.profilePhotoUrl ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function pickPhoto() {
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
      // In a real app this would upload to Supabase Storage first
      setPhotoUrl(result.assets[0].uri)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { user: updated } = await userApi.updateMe({
        name: name.trim(),
        ...(photoUrl ? { profilePhotoUrl: photoUrl } : {}),
      })
      updateUser(updated)
      await loadClubs()
      router.replace('/(app)/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>Tell us a little about yourself</Text>

        <TouchableOpacity style={styles.avatarWrapper} onPress={pickPhoto}>
          <Avatar name={name || 'You'} photoUrl={photoUrl || null} size={88} />
          <Text style={styles.changePhoto}>Tap to add photo</Text>
        </TouchableOpacity>

        <Input
          label="Full name"
          value={name}
          onChangeText={(v) => { setName(v); setError('') }}
          placeholder="Your name"
          error={error}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        <Button title="Get Started" onPress={handleSave} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24, paddingTop: 64 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 32 },
  avatarWrapper: { alignItems: 'center', marginBottom: 32 },
  changePhoto: { fontSize: 13, color: '#1a56db', marginTop: 8, fontWeight: '500' },
})
