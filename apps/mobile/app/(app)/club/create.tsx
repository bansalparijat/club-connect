import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { clubApi, sportTypesApi } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type SportType = { id: string; name: string }

export default function CreateClubScreen() {
  const router = useRouter()
  const { addClub, setActiveClub } = useClubStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sportTypes, setSportTypes] = useState<SportType[]>([])
  const [selectedSportTypeId, setSelectedSportTypeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    sportTypesApi.list().then(({ sportTypes: types }) => {
      setSportTypes(types)
      if (types.length > 0) setSelectedSportTypeId(types[0].id)
    })
  }, [])

  async function handleCreate() {
    if (!name.trim()) {
      setError('Club name is required')
      return
    }
    if (!selectedSportTypeId) {
      setError('Select a sport type')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { club } = await clubApi.create({
        name: name.trim(),
        sportTypeId: selectedSportTypeId,
        ...(description.trim() ? { description: description.trim() } : {}),
      })
      addClub(club)
      setActiveClub(club.id)
      router.replace('/(app)/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create club')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>{'← Back'}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create a club</Text>
        <Text style={styles.subtitle}>You'll be the admin of this club</Text>

        <Input
          label="Club name"
          value={name}
          onChangeText={(v) => { setName(v); setError('') }}
          placeholder="e.g. Mumbai Cricket Club"
          returnKeyType="next"
        />

        <Input
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="A short description"
          returnKeyType="done"
        />

        <Text style={styles.label}>Sport type</Text>
        <View style={styles.sportGrid}>
          {sportTypes.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sportChip, selectedSportTypeId === s.id && styles.sportChipActive]}
              onPress={() => { setSelectedSportTypeId(s.id); setError('') }}
            >
              <Text style={[styles.sportChipText, selectedSportTypeId === s.id && styles.sportChipTextActive]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Create Club" onPress={handleCreate} loading={loading} style={styles.button} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24, paddingTop: 56 },
  back: { marginBottom: 24 },
  backText: { fontSize: 16, color: '#1a56db', fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 28 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 10 },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  sportChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  sportChipActive: { borderColor: '#1a56db', backgroundColor: '#e8f0fe' },
  sportChipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  sportChipTextActive: { color: '#1a56db' },
  error: { fontSize: 13, color: '#ef4444', marginBottom: 12 },
  button: { marginTop: 8 },
})
