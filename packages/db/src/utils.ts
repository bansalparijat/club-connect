import { createId } from './cuid'

export function generateId(): string {
  return createId()
}

export function now(): string {
  return new Date().toISOString()
}

/** Pad a number to 5 digits for sort key ordering (e.g., 3 → "00003") */
export function padPosition(n: number): string {
  return String(n).padStart(5, '0')
}
