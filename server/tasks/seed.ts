import { seed } from "../database/seed"

export default defineTask({
  meta: {
    name: "db:seed",
    description: "Run database seed task",
  },
  async run() {
    console.log("Running DB seed task...")
    const res = await useDrizzle().insert(tables.validators).values(await Promise.all(seed)).returning().get()
    return { result: { inserted: res } }
  },
})
