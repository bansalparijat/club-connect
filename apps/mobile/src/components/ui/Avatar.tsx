import React from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'

type Props = {
  name: string
  photoUrl?: string | null
  size?: number
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function Avatar({ name, photoUrl, size = 40 }: Props) {
  const style = { width: size, height: size, borderRadius: size / 2 }
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[styles.img, style]} />
  }
  return (
    <View style={[styles.placeholder, style, { backgroundColor: '#1a56db' }]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  img: { resizeMode: 'cover' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
})
