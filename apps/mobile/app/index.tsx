import { Redirect } from 'expo-router'
import { useAuthStore } from '@/store/auth'

export default function Index() {
  const { isAuthenticated } = useAuthStore()
  return <Redirect href={isAuthenticated ? '/(app)/' : '/(auth)/phone'} />
}
