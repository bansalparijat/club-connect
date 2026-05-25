import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { authApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'

export default function PhoneScreen() {
  const router = useRouter()
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const normalized = phone.startsWith('+') ? phone : `+91${phone.replace(/\s/g, '')}`

  async function handleSendOtp() {
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter a valid phone number')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authApi.sendOtp(normalized)
      setPendingPhone(normalized)
      router.push('/(auth)/otp')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Club Connect</Text>
          <Text style={styles.tagline}>Manage your club matches effortlessly</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Enter your phone number</Text>
          <Text style={styles.subtitle}>We'll send you a verification code</Text>

          <View style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>+91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(v) => {
                setPhone(v)
                setError('')
              }}
              placeholder="98765 43210"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              maxLength={14}
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Send OTP"
            onPress={handleSendOtp}
            loading={loading}
            style={styles.button}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24 },
  header: { paddingTop: 80, paddingBottom: 48, alignItems: 'center' },
  logo: { fontSize: 30, fontWeight: '800', color: '#1a56db', marginBottom: 8 },
  tagline: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  form: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  phoneRow: { flexDirection: 'row', marginBottom: 8 },
  countryCode: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#f9fafb',
  },
  countryCodeText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  error: { fontSize: 13, color: '#ef4444', marginBottom: 12 },
  button: { marginTop: 8 },
})
