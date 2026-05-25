import { prisma } from './index'

async function main() {
  console.log('Seeding sport types...')

  const sports = [
    {
      name: 'Cricket',
      parameters: [
        { name: 'Ball Type', type: 'SELECT' as const, options: ['Leather', 'Tennis', 'Rubber'], isRequired: true, displayOrder: 1 },
        { name: 'Dress Code', type: 'SELECT' as const, options: ['White', 'Colored', 'Any'], isRequired: true, displayOrder: 2 },
        { name: 'Match Format', type: 'SELECT' as const, options: ['T20', 'One Day', 'Test', 'Other'], isRequired: false, displayOrder: 3 },
        { name: 'Pitch Type', type: 'SELECT' as const, options: ['Turf', 'Matting', 'Concrete', 'Other'], isRequired: false, displayOrder: 4 },
      ],
    },
    {
      name: 'Football',
      parameters: [
        { name: 'Match Format', type: 'SELECT' as const, options: ['11-a-side', '7-a-side', '5-a-side'], isRequired: true, displayOrder: 1 },
        { name: 'Ground Type', type: 'SELECT' as const, options: ['Natural Grass', 'Artificial Turf', 'Futsal Court'], isRequired: false, displayOrder: 2 },
        { name: 'Kit Color', type: 'TEXT' as const, options: null, isRequired: false, displayOrder: 3 },
      ],
    },
    {
      name: 'Badminton',
      parameters: [
        { name: 'Shuttle Type', type: 'SELECT' as const, options: ['Feather', 'Synthetic', 'Either'], isRequired: true, displayOrder: 1 },
        { name: 'Match Type', type: 'SELECT' as const, options: ['Singles', 'Doubles', 'Mixed Doubles'], isRequired: false, displayOrder: 2 },
      ],
    },
    {
      name: 'Basketball',
      parameters: [
        { name: 'Court Type', type: 'SELECT' as const, options: ['Indoor', 'Outdoor'], isRequired: false, displayOrder: 1 },
        { name: 'Match Format', type: 'SELECT' as const, options: ['Full Court', 'Half Court', '3x3'], isRequired: false, displayOrder: 2 },
      ],
    },
    {
      name: 'Tennis',
      parameters: [
        { name: 'Surface', type: 'SELECT' as const, options: ['Clay', 'Hard', 'Grass', 'Carpet'], isRequired: false, displayOrder: 1 },
        { name: 'Match Type', type: 'SELECT' as const, options: ['Singles', 'Doubles'], isRequired: false, displayOrder: 2 },
        { name: 'Sets', type: 'SELECT' as const, options: ['Best of 3', 'Best of 5', 'One Set'], isRequired: false, displayOrder: 3 },
      ],
    },
    {
      name: 'Volleyball',
      parameters: [
        { name: 'Court Type', type: 'SELECT' as const, options: ['Indoor', 'Beach'], isRequired: false, displayOrder: 1 },
        { name: 'Match Format', type: 'SELECT' as const, options: ['6-a-side', '4-a-side (Beach)'], isRequired: false, displayOrder: 2 },
      ],
    },
    {
      name: 'Hockey',
      parameters: [
        { name: 'Surface', type: 'SELECT' as const, options: ['Turf', 'Astro', 'Natural Grass'], isRequired: false, displayOrder: 1 },
        { name: 'Match Format', type: 'SELECT' as const, options: ['Field Hockey', 'Indoor Hockey'], isRequired: false, displayOrder: 2 },
      ],
    },
    {
      name: 'Other',
      parameters: [],
    },
  ]

  for (const sport of sports) {
    const sportType = await prisma.sportType.upsert({
      where: { name: sport.name },
      update: {},
      create: { name: sport.name },
    })

    for (const param of sport.parameters) {
      await prisma.sportParameter.upsert({
        where: { sportTypeId_name: { sportTypeId: sportType.id, name: param.name } },
        update: {},
        create: {
          sportTypeId: sportType.id,
          name: param.name,
          type: param.type,
          options: param.options,
          isRequired: param.isRequired,
          displayOrder: param.displayOrder,
        },
      })
    }

    console.log(`  ✓ ${sport.name} (${sport.parameters.length} parameters)`)
  }

  console.log('Seeding complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
