import { computeVTSScore } from "../vts"
import { consola } from 'consola'

export default defineTask({
  meta: {
    name: "db:compute-score",
    description: "computes the VTS score",
  },
  async run() {
    consola.log("Running db:compute-score task...")
    const scores = await computeVTSScore(useRuntimeConfig().rpcUrl)
    return { result: scores }
  },
})
