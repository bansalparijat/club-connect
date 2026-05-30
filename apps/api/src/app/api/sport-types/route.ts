import { db } from '@club-connect/db'
import { ok } from '@/lib/response'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sportTypes = await db.sportTypes.listWithParameters()
  return ok({ sportTypes })
}
