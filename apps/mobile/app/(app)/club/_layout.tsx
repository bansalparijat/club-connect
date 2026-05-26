import { Stack } from 'expo-router'

export default function ClubLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="management" />
      <Stack.Screen name="members" />
      <Stack.Screen name="add-member" />
      <Stack.Screen name="import" />
      <Stack.Screen name="houses" />
      <Stack.Screen name="seasons" />
      <Stack.Screen name="season-matches" />
      <Stack.Screen name="bulk-houses" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="create" />
    </Stack>
  )
}
