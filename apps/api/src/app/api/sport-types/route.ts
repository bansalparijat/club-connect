import { db } from '@club-connect/db'
import { ok } from '@/lib/response'

export async function GET() {
  const sportTypes = await db.sportTypes.listWithParameters()
  return ok({ sportTypes })
}
