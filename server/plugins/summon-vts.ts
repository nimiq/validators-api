import { createVTS } from "../lib"

export default defineNitroPlugin(() => createVTS(useRuntimeConfig().rpcUrl))
