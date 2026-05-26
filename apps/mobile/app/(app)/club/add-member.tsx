import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { clubApi, House } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function AddMemberScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [houses, setHouses] = useState<House[]>([])
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ phone?: string; name?: string }>({})

  useEffect(() => {
    if (!activeClubId) return
    clubApi.getHouses(activeClubId).then(({ houses: h }) => setHouses(h)).catch(() => {})
  }, [activeClubId])

  async function handleAdd() {
    const errs: { phone?: string; name?: string } = {}
    if (phone.replace(/\D/g, '').length < 10) errs.phone = 'Enter a valid phone number'
    if (!name.trim()) errs.name = 'Name is required'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const normalized = phone.startsWith('+') ? phone : `+91${phone.replace(/\s/g, '')}`
    setLoading(true)
    try {
      const { isNew } = await clubApi.addMember(activeClubId!, {
        phone: normalized,
        name: name.trim(),
        ...(selectedHouseId ? { houseId: selectedHouseId } : {}),
      })
      Alert.alert(
        'Member Added',
        isNew
          ? `${name} has been added. They'll receive an invite to join.`
          : `${name} is already a Club Connect user and has been linked to this club.`,
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Member</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Enter the member's phone number and name. If they're already on Club Connect, they'll be linked automatically.
          </Text>

          <Input
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            error={errors.phone}
          />

          <Input
            label="Full Name"
            value={name}
            onChangeText={setName}
            placeholder="Member's name"
            error={errors.name}
            returnKeyType="done"
          />

          {houses.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>Preferred House (optional)</Text>
              <Text style={styles.sublabel}>Assigns them to this house for the active season.</Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.chip, selectedHouseId === null && styles.chipSelected]}
                  onPress={() => setSelectedHouseId(null)}
                >
                  <Text style={[styles.chipText, selectedHouseId === null && styles.chipTextSelected]}>None</Text>
                </TouchableOpacity>
                {houses.map((h) => (
                  <TouchableOpacity
                    key={h.id}
                    style={[styles.chip, selectedHouseId === h.id && styles.chipSelected]}
                    onPress={() => setSelectedHouseId(h.id)}
                  >
                    {h.color && <View style={[styles.colorDot, { backgroundColor: h.color }]} />}
                    <Text style={[styles.chipText, selectedHouseId === h.id && styles.chipTextSelected]}>{h.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <Button title="Add Member" onPress={handleAdd} loading={loading} />
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
  form: { padding: 20 },
  hint: { fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 22 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 },
  sublabel: { fontSize: 12, color: '#9ca3af', marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
})
