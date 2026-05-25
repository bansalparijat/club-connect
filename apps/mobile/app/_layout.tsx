import React, { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '@/store/auth'
import { useClubStore } from '@/store/club'

export default function RootLayout() {
  const { restoreSession, isLoading, isAuthenticated } = useAuthStore()
  const loadClubs = useClubStore((s) => s.loadClubs)

  useEffect(() => {
    restoreSession()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      loadClubs()
    }
  }, [isAuthenticated])

  if (isLoading) return null

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  )
}
