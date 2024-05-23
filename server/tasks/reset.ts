export default defineTask({
  meta: {
    name: 'db:reset',
    description: 'Deletes all data from the database',
  },
  async run() {
    console.log('deleting DB...')
    const events = await useDrizzle().delete(tables.activity).get()
    const scores = await useDrizzle().delete(tables.scores).get()
    const validators = await useDrizzle().delete(tables.validators).get()
    return { result: { events, scores, validators } }
  },
})
