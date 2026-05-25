import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

type Variant = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'orange'

type Props = {
  label: string
  variant?: Variant
}

const colors: Record<Variant, { bg: string; text: string }> = {
  green: { bg: '#dcfce7', text: '#166534' },
  yellow: { bg: '#fef9c3', text: '#713f12' },
  red: { bg: '#fee2e2', text: '#991b1b' },
  blue: { bg: '#dbeafe', text: '#1e40af' },
  gray: { bg: '#f3f4f6', text: '#4b5563' },
  orange: { bg: '#ffedd5', text: '#9a3412' },
}

export function Badge({ label, variant = 'gray' }: Props) {
  const { bg, text } = colors[variant]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '600' },
})
