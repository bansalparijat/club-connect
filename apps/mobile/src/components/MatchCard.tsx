import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { MatchSummary } from '@/api/client'
import { Badge } from '@/components/ui/Badge'

type Props = {
  match: MatchSummary
  onPress: () => void
}

const STATUS_VARIANT: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'gray' | 'orange'> = {
  CONFIRMED: 'green',
  WAITLISTED: 'yellow',
  UNAVAILABLE: 'red',
  DROPPED: 'gray',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function MatchCard({ match, onPress }: Props) {
  const myStatusLabel =
    match.myStatus === 'CONFIRMED'
      ? 'Available'
      : match.myStatus === 'WAITLISTED'
      ? `Waitlisted`
      : match.myStatus === 'UNAVAILABLE'
      ? 'Unavailable'
      : match.myStatus === 'DROPPED'
      ? 'Dropped'
      : 'Not responded'

  const myStatusVariant = match.myStatus
    ? STATUS_VARIANT[match.myStatus]
    : 'orange'

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{match.title}</Text>
        {match.status !== 'OPEN' && (
          <Badge label={match.status} variant={match.status === 'CANCELLED' ? 'red' : 'gray'} />
        )}
      </View>

      <Text style={styles.date}>{formatDate(match.date)}</Text>
      <Text style={styles.venue} numberOfLines={1}>📍 {match.venue}</Text>

      {match.houses.length > 0 && (
        <Text style={styles.houses}>🏠 {match.houses.map((h) => h.name).join(' vs ')}</Text>
      )}

      <View style={styles.footer}>
        <View style={styles.counts}>
          <Text style={styles.countText}>
            {match.confirmedCount}/{match.capacity} confirmed
          </Text>
          {match.waitlistedCount > 0 && (
            <Text style={styles.countText}> · {match.waitlistedCount} waitlisted</Text>
          )}
        </View>

        <View style={styles.badges}>
          {match.hasFeeDue && (
            <Text style={styles.feeDue}>💰</Text>
          )}
          <Badge label={myStatusLabel} variant={myStatusVariant} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  date: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  venue: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  houses: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  counts: { flexDirection: 'row' },
  countText: { fontSize: 12, color: '#6b7280' },
  badges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  feeDue: { fontSize: 14 },
})
