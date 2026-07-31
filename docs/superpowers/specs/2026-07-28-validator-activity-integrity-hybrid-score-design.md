# Validator Activity Integrity and Hybrid Score Design

## Context

Validator `NQ29 FBVT B4GM S27H UBP4 1MTC GNKQ VPBT 099M` was reportedly offline for two days, but its displayed score barely changed. Production API data exposed two separate problems:

1. Completed validator activity was incomplete while the status endpoint reported the epochs as synchronized.
2. The score formula softened recent downtime enough that the UI rounded away the change.

The validator activity response lacked epochs `1110` and `1238–1245`, while the global status endpoint only reported epoch `1248` as missing. This proves the existing epoch-completeness heuristic can accept partially stored epochs.

## Goals

- Never infer that a completed epoch is synchronized from a partial set of activity rows.
- Never treat missing or unfinalized activity as online.
- Represent synchronization state explicitly as pending, syncing, finalized, or failed.
- Prevent one failed historical epoch from blocking current activity and scores.
- Make two continuous offline days lower a normally healthy validator score into roughly the `90–94` range.
- Preserve long-term validator reputation while making recent outages visible.
- Make all repair and retry operations idempotent.

## Non-goals

- Penalizing validators for random non-election.
- Treating RPC or database failures as validator downtime.
- Replacing all existing score components.
- Requiring current-epoch placeholders to participate in scoring.

## Root causes

### False epoch completeness

`isCompleteFinalizedEpochActivity()` currently considers an epoch complete when at least one finalized row exists and no elected placeholder exists. Missing rows are invisible, so a partially stored epoch can pass this check.

### Non-atomic activity writes

Activity rows are written concurrently. Each existing row is deleted before its replacement is inserted. A Worker interruption or failed insert can leave rows missing. The epoch can then be incorrectly classified as complete.

### Silent validator persistence failure

Validator persistence can log an error and return without throwing. The activity write then skips that validator without failing the epoch.

### Blocking task order

Epoch synchronization processes the oldest gap first and returns on its first failure. The cron wrapper then skips the snapshot and score task. One historical RPC failure can therefore prevent newer activity and scores from advancing.

### Weak recent-outage response

The current availability calculation uses a 270-day window and a quadratic smoothing curve. Full offline epochs contain `0 rewarded / 0 missed`, so reliability ignores them. Recent epochs also receive less weight than older epochs because activity is ordered oldest-first while weight decreases by index.

## Activity epoch state model

Add an `activity_epochs` table with one row per completed epoch:

| Column                   | Type                | Purpose                                                 |
| ------------------------ | ------------------- | ------------------------------------------------------- |
| `epoch_number`           | integer primary key | Completed epoch identifier                              |
| `status`                 | text                | `syncing`, `finalized`, or `failed`                     |
| `expected_elected_count` | integer             | Number of elected validator addresses in election block |
| `stored_elected_count`   | integer             | Number written during successful finalization           |
| `elected_set_hash`       | text                | Deterministic hash of sorted elected addresses          |
| `attempt_count`          | integer             | Synchronization attempt count                           |
| `started_at`             | text                | Latest attempt start time                               |
| `finalized_at`           | text nullable       | Successful completion time                              |
| `last_error`             | text nullable       | Latest failure reason                                   |

Current unfinished epochs remain pending by absence from this table. They are never included in score ranges.

### Invariants

An epoch is finalized only when all these conditions hold:

1. Election block was fetched successfully.
2. Every activity batch was fetched successfully.
3. Every elected validator address was resolved to a stored validator ID.
4. Stored elected address set exactly matches election-block address set.
5. All activity rows and the finalization marker committed atomically.

A validator row absent from a finalized epoch means known random non-election. A validator row absent from an unfinalized epoch means unavailable data and must not be interpreted as online or offline.

## Atomic persistence

For one completed epoch:

1. Fetch and validate the complete epoch in memory.
2. Resolve all validator IDs with failures configured to throw.
3. Build deterministic upsert statements for elected activity rows.
4. Execute one D1 `batch()` containing:
   - epoch marker upsert to `syncing`;
   - all activity upserts;
   - cleanup of stale rows not in the elected set;
   - epoch marker update to `finalized` as the last statement.
5. If any statement fails, D1 rolls back the entire batch.
6. Record a failed attempt separately with its error after rollback.

Use conflict upserts instead of delete-then-insert replacement.

## Existing-data verification

Do not trust the current completeness heuristic and do not blindly fetch every activity batch.

For each epoch in the active 270-day window:

1. Fetch its election block.
2. Build the sorted elected-validator address set and hash.
3. Query finalized elected rows currently stored for that epoch.
4. Compare exact address sets.
5. Mark matching epochs finalized without refetching all batches.
6. Fully refetch and atomically replace mismatched epochs.

Repair order:

1. Last 14 completed days, newest first.
2. Remaining recent failures.
3. Older 270-day history, newest first.

## Synchronization flow

Normal scheduled synchronization runs every six hours:

1. Determine latest completed epoch.
2. Synchronize latest unfinalized completed epoch first.
3. Retry failed epochs inside the 14-day recent window.
4. Process a bounded historical repair batch.
5. Run snapshot synchronization independently of historical failures.
6. Calculate scores only when recent coverage is complete.

A failed epoch records its own error and does not terminate processing of other epochs. A stale `syncing` state is reset and retried on the next run.

## Hybrid score version 2

### Recent availability

Window: last 14 completed days, approximately 29 epochs.

| Epoch status                    | Recent availability treatment  |
| ------------------------------- | ------------------------------ |
| `elected_online`                | `1`                            |
| `elected_degraded`              | `1`; misses affect reliability |
| `elected_failed_or_offline`     | `0`                            |
| `not_elected_randomness`        | Excluded                       |
| `inactive_by_choice_or_removed` | `0`                            |
| Unfinalized epoch               | Score remains stale            |

Formula:

```text
recentAvailability = successfulElectedEpochs / electedOrInactiveEpochs
```

If no eligible epochs exist, no current score is published.

### Long-term availability

Window remains 270 days.

- Random non-election is excluded.
- Elected offline and voluntary inactivity are penalized.
- Missing data is never treated as active.
- Recent epochs receive greater weight than older epochs.
- Existing smoothing remains to preserve long-term reputation behavior.

Until full historical verification finishes, retain the last complete long-term component and expose its coverage and as-of epoch. Never substitute unknown activity.

### Combined score

```text
availability =
  0.5 * longTermAvailability
  + 0.5 * recentAvailability

total = dominance * reliability * availability
```

For a normally healthy validator, two continuous offline days should produce approximately:

```text
longTermAvailability ~= 99.9%
recentAvailability ~= 86%
combined availability ~= 93%
total score ~= 92-93
```

### Versioning

Score rows gain:

- `score_version`
- `recent_availability`
- `long_term_availability`
- `data_status`
- `long_term_coverage`

Version 1 history remains identifiable. Version 2 becomes active only after recent-window verification and shadow-score validation succeed.

## API changes

Validator score response includes:

```json
{
  "scoreVersion": 2,
  "recentAvailability": 0.86,
  "longTermAvailability": 0.999,
  "availability": 0.9295,
  "scoreEpoch": 1248,
  "dataStatus": "complete",
  "longTermCoverage": 1
}
```

Status response includes:

```json
{
  "latestCompletedEpoch": 1248,
  "latestFinalizedEpoch": 1248,
  "failedEpochs": [],
  "syncingEpochs": [],
  "recentCoverage": 1,
  "longTermCoverage": 1,
  "scoreStatus": "current"
}
```

Do not expose generic `unknown` when a more precise synchronization state exists.

## Rollout

1. Add schema and atomic epoch persistence behind existing score behavior.
2. Deploy activity verification while score version 1 remains active.
3. Verify election sets for existing epochs.
4. Repair mismatches newest-first.
5. Reach 100% recent-window coverage.
6. Compute version 2 scores in shadow mode.
7. Validate expected score movement using production-shaped fixtures.
8. Switch API and UI to score version 2.
9. Finish full 270-day verification and rebuild versioned score history.

Production verification and repair require a Wrangler login authorized for Cloudflare account `cf9baad7d68d7ee717f3339731e81dfb`. Current credentials return Cloudflare error `7403`.

## Tests

### Activity integrity

- Partial activity rows cannot finalize an epoch.
- Wrong elected-validator set cannot finalize an epoch.
- Failed D1 batch rolls back rows and marker.
- Validator persistence failure aborts finalization.
- Activity upserts are idempotent.
- Stale syncing attempts are retried.

### Scheduling

- Old failed epoch does not block latest completed epoch.
- Historical failure does not skip snapshot synchronization.
- Newest completed epoch receives priority.
- Per-epoch errors remain observable through status data.

### Scoring

- Missing recent epoch keeps score stale.
- Missing activity is never interpreted as active.
- Random non-election remains neutral.
- Offline elected epoch reduces recent availability.
- Degraded activity affects reliability without double availability penalty.
- Recent weighting order favors newer epochs.
- Two continuous offline days lower a healthy score into the `90–94` range.
- Score version 1 and version 2 rows remain distinguishable.

### Regression fixture

Create a fixture matching the reported validator history:

- historical partial epochs;
- one random non-election epoch;
- one finalized offline epoch;
- one pending placeholder epoch.

Before repair, score must remain stale. After repair and two offline days, score must fall into the expected version 2 range.
