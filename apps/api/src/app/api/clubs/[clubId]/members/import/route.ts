import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withClubAdmin, type RouteContext } from '@/middleware/auth'
import { ok, err } from '@/lib/response'
import { normalizePhone } from '@/lib/otp'
import type { ImportError } from '@club-connect/types'

interface ImportRow { name?: string; phone?: string; [key: string]: string | undefined }

async function parseFile(formData: FormData): Promise<ImportRow[] | null> {
  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) return null

  const fileName = (file as File).name ?? ''
  const buffer = Buffer.from(await file.arrayBuffer())

  if (fileName.endsWith('.csv') || (file as File).type === 'text/csv') {
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').filter(Boolean)
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    return lines.slice(1).map(line => {
      const values = line.split(',')
      const row: ImportRow = {}
      headers.forEach((h, i) => { row[h] = values[i]?.trim() })
      return row
    })
  }

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json<ImportRow>(ws, { defval: '' })
  }

  return null
}

export const POST = withClubAdmin(async (req: NextRequest, _ctx: RouteContext, _userId: string, clubId: string) => {
  let formData: FormData
  try { formData = await req.formData() } catch { return err.badRequest('Expected multipart/form-data') }

  const rows = await parseFile(formData)
  if (!rows) return err.badRequest('Unsupported file format. Use CSV or XLSX.')
  if (rows.length === 0) return err.badRequest('File is empty or has no data rows')
  if (rows.length > 1000) return err.unprocessable('Maximum 1000 rows per import')

  let imported = 0
  let existing = 0
  const errors: ImportError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 1-indexed, +1 for header

    const rawPhone = String(row.phone ?? row.Phone ?? row.PHONE ?? '').trim()
    const name = String(row.name ?? row.Name ?? row.NAME ?? '').trim()

    if (!rawPhone) { errors.push({ row: rowNum, phone: rawPhone, reason: 'Missing phone number' }); continue }
    if (!name) { errors.push({ row: rowNum, phone: rawPhone, reason: 'Missing name' }); continue }

    let phone: string
    try { phone = normalizePhone(rawPhone) } catch {
      errors.push({ row: rowNum, phone: rawPhone, reason: 'Invalid phone number' }); continue
    }

    try {
      // Find or create user
      let user = await prisma.user.findUnique({ where: { phone } })
      const isNew = !user
      if (!user) {
        user = await prisma.user.create({ data: { phone, name, isStub: true } })
      }

      // Find or create membership
      const membership = await prisma.clubMembership.findUnique({
        where: { clubId_userId: { clubId, userId: user.id } },
      })

      if (membership) {
        if (membership.status !== 'ACTIVE') {
          await prisma.clubMembership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } })
        }
        existing++
      } else {
        await prisma.clubMembership.create({ data: { clubId, userId: user.id, role: 'MEMBER', status: isNew ? 'INVITED' : 'ACTIVE' } })
        imported++
      }
    } catch (e) {
      errors.push({ row: rowNum, phone: rawPhone, reason: 'Database error' })
      console.error('[bulk-import] Row error:', e)
    }
  }

  return ok({ imported, existing, errors, total: rows.length })
})
