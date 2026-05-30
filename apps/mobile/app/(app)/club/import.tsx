import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { useClubStore } from '@/store/club'
import { getAccessToken } from '@/api/client'
import Constants from 'expo-constants'

const BASE_URL = (Constants.expoConfig?.extra?.apiUrl as string) || 'http://localhost:3000'

type ImportResult = {
  imported: number
  existing: number
  errors: Array<{ row: number; phone: string; reason: string }>
  total: number
}

export default function BulkImportScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  const pickFile = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    })
    if (picked.canceled || !picked.assets[0]) return

    const file = picked.assets[0]
    setFileName(file.name)
    setResult(null)
    setLoading(true)

    try {
      const token = await getAccessToken()
      const formData = new FormData()
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'text/csv',
      } as unknown as Blob)

      const res = await fetch(`${BASE_URL}/api/clubs/${activeClubId}/members/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        Alert.alert('Import Failed', data?.error?.message ?? 'Upload failed')
        return
      }
      setResult(data)
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }, [activeClubId])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bulk Import</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.instructions}>
          <Text style={styles.instructTitle}>How it works</Text>
          <Text style={styles.instructText}>
            1. Prepare a CSV or Excel file with columns: <Text style={styles.code}>name</Text> and <Text style={styles.code}>phone</Text>.{'\n'}
            2. Upload the file below.{'\n'}
            3. Existing Club Connect users will be linked automatically. New users get a stub profile.
          </Text>
        </View>

        <TouchableOpacity style={styles.uploadBtn} onPress={pickFile} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#1a56db" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={32} color="#1a56db" />
              <Text style={styles.uploadText}>
                {fileName ? fileName : 'Choose CSV or Excel file'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {result && (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>Import Complete</Text>

            <View style={styles.statRow}>
              <StatBox label="Imported" value={result.imported} color="#166534" bg="#dcfce7" />
              <StatBox label="Already existed" value={result.existing} color="#1e40af" bg="#dbeafe" />
              <StatBox label="Errors" value={result.errors.length} color="#991b1b" bg="#fee2e2" />
            </View>

            {result.errors.length > 0 && (
              <View style={styles.errorsSection}>
                <Text style={styles.errorsTitle}>Errors</Text>
                {result.errors.map((e) => (
                  <View key={`${e.row}-${e.phone}`} style={styles.errorRow}>
                    <Text style={styles.errorRowText}>
                      Row {e.row} · {e.phone}: {e.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function StatBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.statBox, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  content: { padding: 20, paddingBottom: 40 },
  instructions: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  instructTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  instructText: { fontSize: 13, color: '#6b7280', lineHeight: 22 },
  code: { fontFamily: 'monospace', backgroundColor: '#f3f4f6', color: '#374151' },
  uploadBtn: {
    borderWidth: 2,
    borderColor: '#1a56db',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0f4ff',
    marginBottom: 20,
  },
  uploadText: { fontSize: 14, color: '#1a56db', fontWeight: '500', textAlign: 'center' },
  result: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  resultTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 16 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  errorsSection: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  errorsTitle: { fontSize: 13, fontWeight: '700', color: '#991b1b', marginBottom: 8 },
  errorRow: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 6 },
  errorRowText: { fontSize: 12, color: '#991b1b' },
})
