import React from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type TouchableOpacityProps,
} from 'react-native'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type Props = TouchableOpacityProps & {
  title: string
  variant?: Variant
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ title, variant = 'primary', loading, size = 'md', disabled, style, ...rest }: Props) {
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], styles[`size_${size}`], isDisabled && styles.disabled, style]}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#1a56db'} size="small" />
      ) : (
        <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`]]}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: '#1a56db' },
  secondary: { backgroundColor: '#e8f0fe', borderWidth: 1, borderColor: '#1a56db' },
  danger: { backgroundColor: '#ef4444' },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },

  size_sm: { paddingVertical: 8, paddingHorizontal: 14 },
  size_md: { paddingVertical: 13, paddingHorizontal: 20 },
  size_lg: { paddingVertical: 16, paddingHorizontal: 24 },

  text: { fontWeight: '600' },
  text_primary: { color: '#fff' },
  text_secondary: { color: '#1a56db' },
  text_danger: { color: '#fff' },
  text_ghost: { color: '#1a56db' },

  textSize_sm: { fontSize: 13 },
  textSize_md: { fontSize: 15 },
  textSize_lg: { fontSize: 17 },
})
