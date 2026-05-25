import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { clubApi } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'

export default function ClubSettingsScreen() {
  const router = useRouter()
  const { activeClubId, updateClub } = useClubStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ name?: string }>({})

  useEffect(() => {
    if (!activeClubId) return
    clubApi.get(activeClubId).then(({ club }) => {
      setName(club.name)
      setDescription(club.description ?? '')
      setLogoUrl(club.logoUrl ?? '')
    }).catch(() => {})
  }, [activeClubId])

  async function pickLogo() {
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
      setLogoUrl(result.assets[0].uri)
    }
  }

  async function handleSave() {
    if (!name.trim()) { setErrors({ name: 'Club name is required' }); return }
    setErrors({})
    setSaving(true)
    try {
      const { club } = await clubApi.update(activeClubId!, {
        name: name.trim(),
        description: description.trim() || undefined,
        logoUrl: logoUrl || undefined,
      })
      updateClub(club)
      Alert.alert('Saved', 'Club settings updated.')
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Club Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoSection}>
            <TouchableOpacity onPress={pickLogo}>
              <Avatar name={name || 'C'} photoUrl={logoUrl || null} size={80} />
              <Text style={styles.changeLogo}>Change Logo</Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Club Name"
            value={name}
            onChangeText={setName}
            placeholder="Enter club name"
            error={errors.name}
          />

          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description (optional)"
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />

          <Button title="Save Changes" onPress={handleSave} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  logoSection: { alignItems: 'center', marginBottom: 24 },
  changeLogo: { fontSize: 13, color: '#1a56db', marginTop: 6, textAlign: 'center', fontWeight: '500' },
})
