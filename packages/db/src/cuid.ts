// Minimal CUID-like ID generator (no external dependency)
// Produces collision-resistant, sortable IDs

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'
let counter = 0

function pad(num: number, size: number): string {
  const s = num.toString(36)
  return s.length >= size ? s : '0'.repeat(size - s.length) + s
}

function randomBlock(): string {
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += BASE36[Math.floor(Math.random() * 36)]
  }
  return result
}

export function createId(): string {
  const timestamp = pad(Date.now(), 8)
  const count = pad(counter++, 4)
  if (counter > 1679615) counter = 0 // reset at 36^4
  return `c${timestamp}${count}${randomBlock()}${randomBlock()}`
}
