import type { Client } from '@libsql/client'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'

const migrationDirectory = fileURLToPath(new URL('.', import.meta.url))
const clients: Client[] = []

async function executeMigration(
  client: Client,
  filename: string,
) {
  const migration = await readFile(`${migrationDirectory}${filename}`, 'utf8')
  await client.executeMultiple(migration)
}

describe('database migrations', () => {
  afterEach(() => {
    for (const client of clients)
      client.close()
    clients.length = 0
  })

  it('migrates pre-0005 scores and keeps score checks valid after the table rename', async () => {
    const client = createClient({ url: 'file::memory:' })
    clients.push(client)
    await client.execute('PRAGMA legacy_alter_table = ON')

    for (const migration of [
      '0000_cultured_wallflower.sql',
      '0001_dashing_whiplash.sql',
      '0002_magenta_anita_blake.sql',
      '0003_add_cron_runs.sql',
      '0004_add_validator_is_listed.sql',
    ]) {
      await executeMigration(client, migration)
    }

    await client.execute('ALTER TABLE validators ADD COLUMN is_listed integer')
    await client.execute(`
      INSERT INTO validators (
        id,
        address,
        logo,
        accent_color,
        is_listed
      ) VALUES (1, 'NQ00 TEST', 'logo.svg', '#fff', 1)
    `)
    await client.execute(`
      INSERT INTO scores (
        validator_id,
        epoch_number,
        total,
        availability,
        dominance,
        reliability
      ) VALUES (1, 100, 0.8, 0.9, 0.7, 0.6)
    `)

    await executeMigration(client, '0005_validator_activity_integrity_score_v2.sql')
    await executeMigration(client, '0006_score_backfill_cursor.sql')

    await client.execute('INSERT INTO score_backfill_state (id, last_scanned_epoch) VALUES (1, 99)')
    expect((await client.execute('SELECT last_scanned_epoch FROM score_backfill_state')).rows).toEqual([
      { last_scanned_epoch: 99 },
    ])

    const migrated = await client.execute(`
      SELECT
        score_version,
        data_status,
        recent_availability,
        long_term_availability,
        long_term_coverage,
        long_term_as_of_epoch
      FROM scores
      WHERE validator_id = 1 AND epoch_number = 100
    `)
    expect(migrated.rows).toEqual([{
      score_version: 1,
      data_status: 'complete',
      recent_availability: null,
      long_term_availability: null,
      long_term_coverage: null,
      long_term_as_of_epoch: null,
    }])

    await client.execute(`
      INSERT INTO scores (
        validator_id,
        epoch_number,
        score_version,
        total,
        availability,
        recent_availability,
        long_term_availability,
        dominance,
        reliability,
        data_status,
        long_term_coverage,
        long_term_as_of_epoch
      ) VALUES (1, 101, 2, 0.9, 0.91, 0.92, 0.89, 0.8, 0.7, 'stale', 0.95, 99)
    `)

    await expect(client.execute(`
      INSERT INTO scores (
        validator_id,
        epoch_number,
        score_version,
        total,
        availability,
        dominance,
        reliability,
        data_status
      ) VALUES (1, 102, 3, 0.9, 0.91, 0.8, 0.7, 'complete')
    `)).rejects.toThrow()

    await expect(client.execute(`
      INSERT INTO scores (
        validator_id,
        epoch_number,
        score_version,
        total,
        availability,
        dominance,
        reliability,
        data_status
      ) VALUES (1, 102, 2, 0.9, 0.91, 0.8, 0.7, 'invalid')
    `)).rejects.toThrow()
  })
})
