import { prisma } from '@/lib/prisma'
import { ok } from '@/lib/response'

export async function GET() {
  const sportTypes = await prisma.sportType.findMany({
    include: {
      parameters: { orderBy: { displayOrder: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })
  return ok({ sportTypes })
}
