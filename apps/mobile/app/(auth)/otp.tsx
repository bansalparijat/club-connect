import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  ScrollView,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { authApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { useClubStore } from '@/store/club'
import { Button } from '@/components/ui/Button'

const OTP_LENGTH = 6
const RESEND_TIMEOUT = 30

export default function OtpScreen() {
  const router = useRouter()
  const phone = useAuthStore((s) => s.pendingPhone) ?? ''
  const { setAuth } = useAuthStore()
  const loadClubs = useClubStore((s) => s.loadClubs)

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendSeconds, setResendSeconds] = useState(RESEND_TIMEOUT)
  const [resending, setResending] = useState(false)
  const inputRef = useRef<TextInput>(null)

  // If no pending phone (e.g. app reloaded while on this screen), go back to phone entry
  useEffect(() => {
    if (!phone) {
      router.replace('/(auth)/phone')
    }
  }, [phone, router])

  // Delayed focus fixes Android keyboard not appearing on hidden inputs
  useEffect(() => {
    if (!phone) return
    const focusTimeout = setTimeout(() => {
      inputRef.current?.focus()
    }, 150)
    const timer = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => {
      clearTimeout(focusTimeout)
      clearInterval(timer)
    }
  }, [phone])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  // Handle Android hardware back button
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack()
        return true
      })
      return () => sub.remove()
    }, [handleBack])
  )

  async function handleVerify(code: string) {
    if (code.length < OTP_LENGTH) return
    setError('')
    setLoading(true)
    try {
      const data = await authApi.verifyOtp(phone, code)
      await AsyncStorage.setItem('last_verified_phone', phone)
      await setAuth(data.user, data.accessToken, data.refreshToken)

      if (data.user.isStub || !data.user.name) {
        router.replace('/(auth)/profile')
      } else {
        await loadClubs()
        router.replace('/(app)/')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid OTP'
      setError(msg)
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendSeconds > 0) return
    setResending(true)
    try {
      await authApi.sendOtp(phone)
      setResendSeconds(RESEND_TIMEOUT)
      setError('')
    } catch {
      setError('Failed to resend OTP')
    } finally {
      setResending(false)
    }
  }

  function handleChange(val: string) {
    const clean = val.replace(/\D/g, '').slice(0, OTP_LENGTH)
    setOtp(clean)
    setError('')
    if (clean.length === OTP_LENGTH) {
      handleVerify(clean)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={false}
      >
        <TouchableOpacity onPress={handleBack} style={styles.back}>
          <Text style={styles.backText}>{'← Back'}</Text>
        </TouchableOpacity>

        <View style={styles.body}>
          <Text style={styles.title}>Enter verification code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.phone}>{phone}</Text>
          </Text>

          {/* Input positioned off-screen so Android shows keyboard, dots are the visual UI */}
          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            style={styles.hiddenInput}
            caretHidden
            showSoftInputOnFocus
          />

          <TouchableOpacity
            activeOpacity={1}
            style={styles.dotsRow}
            onPress={() => inputRef.current?.focus()}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <View key={i} style={styles.dotBox}>
                <Text style={styles.dotText}>{otp[i] ?? ''}</Text>
                <View style={[styles.underline, otp.length === i && styles.underlineActive]} />
              </View>
            ))}
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title="Verify" onPress={() => handleVerify(otp)} loading={loading} style={styles.button} />

          <TouchableOpacity
            onPress={handleResend}
            disabled={resendSeconds > 0 || resending}
            style={styles.resendRow}
          >
            <Text style={[styles.resendText, resendSeconds > 0 && styles.resendDisabled]}>
              {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend OTP'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 56 },
  back: { marginBottom: 32 },
  backText: { fontSize: 16, color: '#1a56db', fontWeight: '500' },
  body: {},
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 32, lineHeight: 22 },
  phone: { color: '#111827', fontWeight: '600' },
  // Off-screen but has real dimensions so Android keyboard fires correctly
  hiddenInput: { position: 'absolute', width: 1, height: 1, top: 0, left: -1000, opacity: 0 },
  dotsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  dotBox: { flex: 1, alignItems: 'center', paddingBottom: 8 },
  dotText: { fontSize: 24, fontWeight: '700', color: '#111827', height: 32 },
  underline: { height: 2, width: '100%', backgroundColor: '#d1d5db', borderRadius: 1 },
  underlineActive: { backgroundColor: '#1a56db' },
  error: { fontSize: 13, color: '#ef4444', marginBottom: 12, textAlign: 'center' },
  button: { marginTop: 8 },
  resendRow: { marginTop: 20, alignItems: 'center' },
  resendText: { fontSize: 14, color: '#1a56db', fontWeight: '500' },
  resendDisabled: { color: '#9ca3af' },
})
