import { Address, Client } from "nimiq-rpc-client-ts";
import { Validator, NewEvent, EventName } from "../utils/drizzle";

// @ts-expect-error no types
import Identicons from '@nimiq/identicons'

interface FetchEventsOptions {
  ignoreHashes?: string[]
}

async function fetchEvents(client: Client, validator: Validator, { ignoreHashes }: FetchEventsOptions = {}): Promise<NewEvent[]> {
  const { data: _validatorTxs, error } = await client.blockchain.getTransactionsByAddress(validator.address as Address)
  if (error) throw new Error(`Could not get transactions for validator ${validator.address}: ${error.message}`)

  const validatorTxs = _validatorTxs.filter(tx => !ignoreHashes?.includes(tx))

  // FIXME
  // For now, we only care about the youngest transaction and we assume that this transaction is the CreateValidator transaction
  // we need to change this as validators can stop and start again
  const { data: tx, error: txError } = await client.blockchain.getTransactionByHash(validatorTxs[0])
  if (txError) throw new Error(`Could not get transaction ${validatorTxs[0]}: ${txError.message}`)

  const events: NewEvent[] = [
    {
      event: EventName.CreateValidator,
      validatorId: validator.id,
      timestamp: new Date(tx.timestamp),
      blockNumber: tx.blockNumber,
      hash: tx.hash,
    }
  ]

  return events
}

async function syncEvents(client: Client, validators: Validator[]) {
  async function syncValidatorEvents(validator: Validator) {
    const ignoreHashes = (await useDrizzle().select({ hash: tables.events.hash }).from(tables.events).where(eq(tables.events.id, validator.id)).all()).map(row => row.hash)
    const events = await fetchEvents(client, validator, { ignoreHashes })
    useDrizzle().insert(tables.events).values(events)
  }

  await Promise.all(validators.map(syncValidatorEvents))
}

async function syncValidators(client: Client) {
  const { data: currentValidators, error } = await client.blockchain.getActiveValidators()
  if (error) {
    console.error(error)
    return
  }

  for (const v of currentValidators) {
    const validator = await useDrizzle().select().from(tables.validators).where(eq(tables.validators.address, v.address)).get()
    if (validator?.state === ValidatorState.Active) {
      // Already in the database and active
      useDrizzle().update(tables.validators).set({ balance: v.balance }).where(eq(tables.validators.id, validator.id))
    } else if (validator) {
      // Validator is in the database but not active
      useDrizzle().update(tables.validators).set({ state: ValidatorState.Active, balance: v.balance }).where(eq(tables.validators.id, validator.id))
    } else {
      // Validator is not in the database
      await useDrizzle().insert(tables.validators).values({
        address: v.address,
        name: 'Unknown validator',
        fee: -1,
        payoutType: PayoutType.Direct, // TODO
        description: '',
        icon: await Identicons.default.toDataUrl(v.address),
        tag: ValidatorTag.Community,
        website: '',
        state: ValidatorState.Active,
        balance: v.balance,
      })
    }
  }
}

export async function dbSync(client: Client): Promise<Validator[]> {
  await syncValidators(client)
  const validators = await useDrizzle().select().from(tables.validators).orderBy(tables.validators.id)
  if (!validators) return []
  syncEvents(client, validators)
  return validators
}
