import { fetchVTSData } from "../vts"
import { consola } from 'consola'

export default defineTask({
  meta: {
    name: "db:fetch",
    description: "fetchs the necessary data from the blockchain",
  },
  async run() {
    consola.log("Running db:fetch task...")
    await fetchVTSData(useRuntimeConfig().rpcUrl)
    return { result: "Started retrieving data from the blockchain. Check server logs." }
  },
})
