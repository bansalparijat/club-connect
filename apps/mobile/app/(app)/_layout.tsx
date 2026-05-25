import React from 'react'
import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/store/auth'

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/phone" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1a56db',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopColor: '#f3f4f6',
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          title: 'Availability',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
      {/* Hidden screens (not in tab bar) */}
      <Tabs.Screen name="match/[id]" options={{ href: null }} />
      <Tabs.Screen name="match/create" options={{ href: null }} />
      <Tabs.Screen name="club/management" options={{ href: null }} />
      <Tabs.Screen name="club/members" options={{ href: null }} />
      <Tabs.Screen name="club/add-member" options={{ href: null }} />
      <Tabs.Screen name="club/import" options={{ href: null }} />
      <Tabs.Screen name="club/houses" options={{ href: null }} />
      <Tabs.Screen name="club/seasons" options={{ href: null }} />
      <Tabs.Screen name="club/settings" options={{ href: null }} />
    </Tabs>
  )
}
