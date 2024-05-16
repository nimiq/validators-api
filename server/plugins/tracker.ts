import { Client } from 'nimiq-rpc-client-ts'
export default defineNitroPlugin(async (nitro) => {
  const { rpcUrl } = useRuntimeConfig()

  if (!rpcUrl) throw new Error("RPC_URL is not set in the .env file");

  const client = new Client(new URL(rpcUrl))

  const { data: policyConstants } = await client.policy.getPolicyConstants();
  if (!policyConstants) throw new Error("Could not get policy constants");

  console.log({ policyConstants })
})
