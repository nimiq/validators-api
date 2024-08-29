import { poolQuerySchema } from '../utils/schemas'
import { fetchValidators } from '../utils/validators'

export default defineEventHandler(async (event) => {
  const { onlyPools } = await getValidatedQuery(event, poolQuerySchema.parse)
  const validators = await fetchValidators({ onlyPools })
  return { validators }
})
