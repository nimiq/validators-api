import type { Client, InArgs, ResultSet } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

const CREATE_TEST_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE validators (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  name text DEFAULT 'Unknown validator' NOT NULL,
  address text NOT NULL UNIQUE,
  description text,
  fee real DEFAULT -1,
  payout_type text DEFAULT 'none',
  payout_schedule text,
  is_maintained_by_nimiq integer DEFAULT 0,
  logo text NOT NULL,
  has_default_logo integer DEFAULT 1 NOT NULL,
  accent_color text NOT NULL,
  website text,
  contact text,
  is_listed integer
);

CREATE TABLE scores (
  validator_id integer NOT NULL REFERENCES validators(id) ON DELETE CASCADE,
  epoch_number integer NOT NULL,
  score_version integer DEFAULT 1 NOT NULL CHECK(score_version IN (1, 2)),
  total real NOT NULL,
  availability real NOT NULL,
  recent_availability real,
  long_term_availability real,
  dominance real NOT NULL,
  reliability real NOT NULL,
  data_status text DEFAULT 'complete' NOT NULL CHECK(data_status IN ('complete', 'stale')),
  long_term_coverage real,
  long_term_as_of_epoch integer,
  PRIMARY KEY (validator_id, epoch_number, score_version)
);

CREATE INDEX idx_validator_id ON scores(validator_id);
CREATE INDEX idx_scores_validator_version_epoch ON scores(validator_id, score_version, epoch_number);

CREATE TABLE activity (
  validator_id integer NOT NULL REFERENCES validators(id) ON DELETE CASCADE,
  epoch_number integer NOT NULL,
  likelihood integer NOT NULL,
  rewarded integer NOT NULL,
  missed integer NOT NULL,
  dominance_ratio_via_balance integer NOT NULL,
  dominance_ratio_via_slots integer NOT NULL,
  balance real DEFAULT -1 NOT NULL,
  stakers integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (validator_id, epoch_number)
);

CREATE INDEX idx_election_block ON activity(epoch_number);

CREATE TABLE activity_epochs (
  epoch_number integer PRIMARY KEY NOT NULL,
  status text NOT NULL CHECK(status IN ('syncing', 'finalized', 'failed')),
  expected_elected_count integer,
  stored_elected_count integer,
  elected_set_hash text,
  attempt_count integer DEFAULT 0 NOT NULL,
  started_at text NOT NULL,
  finalized_at text,
  last_error text,
  CHECK(
    (expected_elected_count IS NULL OR expected_elected_count >= 0)
    AND (stored_elected_count IS NULL OR stored_elected_count >= 0)
    AND attempt_count >= 0
  ),
  CHECK(
    status != 'finalized' OR (
      expected_elected_count IS NOT NULL
      AND stored_elected_count IS NOT NULL
      AND expected_elected_count = stored_elected_count
      AND elected_set_hash IS NOT NULL
      AND length(trim(elected_set_hash, ' ' || char(9) || char(10) || char(13))) > 0
      AND length(trim(started_at, ' ' || char(9) || char(10) || char(13))) > 0
      AND finalized_at IS NOT NULL
      AND length(trim(finalized_at, ' ' || char(9) || char(10) || char(13))) > 0
      AND last_error IS NULL
    )
  )
);

CREATE INDEX idx_activity_epochs_status ON activity_epochs(status);
CREATE INDEX idx_activity_epochs_finalized ON activity_epochs(status, epoch_number);
`

export interface TestDbTrace {
  executed: string[]
  batches: string[][]
  reset: () => void
}

export interface TestDbHarness {
  client: Client
  db: LibSQLDatabase<typeof schema>
  trace: TestDbTrace
  execute: (sql: string, args?: InArgs) => Promise<ResultSet>
  close: () => void
}

function getStatementSql(statement: unknown): string {
  if (typeof statement === 'string')
    return statement
  if (Array.isArray(statement) && typeof statement[0] === 'string')
    return statement[0]
  if (statement && typeof statement === 'object' && 'sql' in statement && typeof statement.sql === 'string')
    return statement.sql
  return String(statement)
}

export async function createTestDbHarness(): Promise<TestDbHarness> {
  const rawClient = createClient({ url: 'file::memory:' })
  await rawClient.executeMultiple(CREATE_TEST_SCHEMA)

  const trace: TestDbTrace = {
    executed: [],
    batches: [],
    reset() {
      this.executed.length = 0
      this.batches.length = 0
    },
  }
  const client = new Proxy(rawClient, {
    get(target, property) {
      if (property === 'execute') {
        return (...args: Parameters<Client['execute']>) => {
          trace.executed.push(getStatementSql(args[0]))
          return Reflect.apply(target.execute, target, args)
        }
      }
      if (property === 'batch') {
        return (...args: Parameters<Client['batch']>) => {
          trace.batches.push(args[0].map(getStatementSql))
          return Reflect.apply(target.batch, target, args)
        }
      }

      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Client
  const db = drizzle(client, { schema })

  return {
    client,
    db,
    trace,
    execute: (sql, args) => client.execute(sql, args),
    close: () => client.close(),
  }
}
