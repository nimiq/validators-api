import { createVTS } from "../lib"

export default defineTask({
  meta: {
    name: "db:sync",
    description: "Sync the database with the blockchain",
  },
  async run() {
    console.log("Running DB sync task...")
    const res = await createVTS(useRuntimeConfig().rpcUrl)
    return { result: { inserted: res } }
  },
})
