import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { clubApi, House } from '@/api/client'
import { useClubStore } from '@/store/club'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
]

export default function HouseManagementScreen() {
  const router = useRouter()
  const { activeClubId } = useClubStore()

  const [houses, setHouses] = useState<House[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingHouse, setEditingHouse] = useState<House | null>(null)
  const [houseName, setHouseName] = useState('')
  const [houseColor, setHouseColor] = useState(PRESET_COLORS[0])
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  const load = useCallback(async () => {
    if (!activeClubId) return
    try {
      const { houses: h } = await clubApi.getHouses(activeClubId)
      setHouses(h)
    } catch {}
  }, [activeClubId])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditingHouse(null)
    setHouseName('')
    setHouseColor(PRESET_COLORS[0])
    setLogoUrl('')
    setNameError('')
    setModalVisible(true)
  }

  function openEdit(house: House) {
    setEditingHouse(house)
    setHouseName(house.name)
    setHouseColor(house.color ?? PRESET_COLORS[0])
    setLogoUrl(house.logoUrl ?? '')
    setNameError('')
    setModalVisible(true)
  }

  async function handleSave() {
    if (!houseName.trim()) { setNameError('Name is required'); return }
    setSaving(true)
    try {
      const data = { name: houseName.trim(), color: houseColor, ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}) }
      if (editingHouse) {
        await clubApi.updateHouse(activeClubId!, editingHouse.id, data)
      } else {
        await clubApi.createHouse(activeClubId!, data)
      }
      setModalVisible(false)
      await load()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(house: House) {
    Alert.alert('Delete House?', `"${house.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await clubApi.deleteHouse(activeClubId!, house.id)
            await load()
          } catch (err: unknown) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete')
          }
        },
      },
    ])
  }

  async function pickLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow Club Connect to access your photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) {
      setLogoUrl(result.assets[0].uri)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Houses</Text>
        <TouchableOpacity onPress={openAdd}>
          <Ionicons name="add" size={26} color="#1a56db" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={houses}
        keyExtractor={(h) => h.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.houseRow}>
            {item.logoUrl ? (
              <Image source={{ uri: item.logoUrl }} style={styles.houseLogoThumb} />
            ) : (
              <View style={[styles.colorDot, { backgroundColor: item.color ?? '#6b7280' }]} />
            )}
            <Text style={styles.houseName}>{item.name}</Text>
            <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
              <Ionicons name="pencil-outline" size={18} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No houses yet. Add one above.</Text>
        }
      />

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{editingHouse ? 'Edit House' : 'Add House'}</Text>

          <Input
            label="House Name"
            value={houseName}
            onChangeText={(v) => { setHouseName(v); setNameError('') }}
            placeholder="e.g. Lions"
            error={nameError}
          />

          <Text style={styles.colorLabel}>Logo (optional)</Text>
          <View style={styles.logoRow}>
            <TouchableOpacity style={styles.logoPicker} onPress={pickLogo}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="image-outline" size={28} color="#9ca3af" />
                  <Text style={styles.logoPlaceholderText}>Pick Logo</Text>
                </View>
              )}
            </TouchableOpacity>
            {logoUrl ? (
              <TouchableOpacity style={styles.logoRemoveBtn} onPress={() => setLogoUrl('')}>
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.colorLabel}>Color</Text>
          <View style={styles.colorsRow}>
            {PRESET_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c }, houseColor === c && styles.colorSwatchSelected]}
                onPress={() => setHouseColor(c)}
              />
            ))}
          </View>

          <Button title={editingHouse ? 'Save Changes' : 'Add House'} onPress={handleSave} loading={saving} style={{ marginTop: 16 }} />
        </View>
      </Modal>
    </SafeAreaView>
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
  list: { padding: 16 },
  houseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  houseLogoThumb: { width: 28, height: 28, borderRadius: 14 },
  houseName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#111827' },
  iconBtn: { padding: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingTop: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 20 },
  colorLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 10 },
  colorsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#111827' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  logoPicker: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  logoImage: { width: 72, height: 72 },
  logoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoPlaceholderText: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  logoRemoveBtn: { padding: 4 },
})
