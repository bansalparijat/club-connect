import { NextResponse } from 'next/server'
import { db } from '@club-connect/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Simple DynamoDB connectivity check — list sport types (cheap query)
    await db.sportTypes.list()
    return NextResponse.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', db: 'disconnected' }, { status: 503 })
  }
}
