import { describe, it, expect } from 'vitest'
import { db } from '../../index'

describe('SportTypeRepo', () => {
  it('creates sport types and lists them', async () => {
    await db.sportTypes.create({ name: 'Cricket' })
    await db.sportTypes.create({ name: 'Football' })

    const types = await db.sportTypes.list()
    expect(types.length).toBe(2)
    expect(types[0].name).toBe('Cricket') // sorted alphabetically
  })

  it('finds by name', async () => {
    const t = await db.sportTypes.findByName('Cricket')
    expect(t).not.toBeNull()
    expect(t!.name).toBe('Cricket')
  })

  it('finds by ID', async () => {
    const all = await db.sportTypes.list()
    const found = await db.sportTypes.findById(all[0].id)
    expect(found).not.toBeNull()
  })

  it('creates and lists parameters', async () => {
    const cricket = await db.sportTypes.findByName('Cricket')

    await db.sportTypes.createParameter({
      sportTypeId: cricket!.id, name: 'Ball Type', type: 'SELECT',
      options: ['Leather', 'Tennis'], isRequired: true, displayOrder: 1,
    })
    await db.sportTypes.createParameter({
      sportTypeId: cricket!.id, name: 'Format', type: 'SELECT',
      options: ['T20', 'ODI'], isRequired: false, displayOrder: 2,
    })

    const params = await db.sportTypes.listParameters(cricket!.id)
    expect(params.length).toBe(2)
    expect(params[0].displayOrder).toBe(1)
    expect(params[0].options).toEqual(['Leather', 'Tennis'])
  })

  it('lists with parameters', async () => {
    const result = await db.sportTypes.listWithParameters()
    const cricket = result.find(t => t.name === 'Cricket')
    expect(cricket).toBeDefined()
    expect(cricket!.parameters.length).toBe(2)

    const football = result.find(t => t.name === 'Football')
    expect(football!.parameters.length).toBe(0)
  })
})
