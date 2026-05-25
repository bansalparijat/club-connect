import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { clubApi } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function AddMemberScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ phone?: string; name?: string }>({})

  async function handleAdd() {
    const errs: { phone?: string; name?: string } = {}
    if (phone.replace(/\D/g, '').length < 10) errs.phone = 'Enter a valid phone number'
    if (!name.trim()) errs.name = 'Name is required'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const normalized = phone.startsWith('+') ? phone : `+91${phone.replace(/\s/g, '')}`
    setLoading(true)
    try {
      const { isNew, user } = await clubApi.addMember(activeClubId!, {
        phone: normalized,
        name: name.trim(),
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
            onSubmitEditing={handleAdd}
          />

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
})
