# v1.0.0

## Breaking Changes

- Deleted `/api/v1/epochs/<number>`
- Deleted `/api/v1/epochs/missing` 
- Deleted `/api/v1/score/health`
- Deleted `/api/v1/score`
- Deleted `/api/v1/validators/balance`
- Deleted `/api/v1/validators/import`
- Removed `only-active` query param from `/api/v1/validators`. 

## Features

- `/api/v1/validator/<address>`: Get whole validator information including the social media and website links.
- New endpoint /validators/[epochs]
- Store activity for every validator in the database, not only active ones
- Return score for every validator in the database, not only active ones
- `/api/v1/sync`: Syncronize the database. Internal.
- `/api/v1/status`: Get the status of the database and sync process. Internal.
- Updated dashboard with more stats
- Updated `activity` table to include `stakers` count for each validator in each epoch.
- Improved CI.

# v0.0.1

- `/api/v1/distribution`: Get the distribution of the network for staking calculations. Internal.
- `/api/v1/epochs/<number>`: Get the score for a specific epoch. Internal.
- `/api/v1/epochs/missing`: Retrieves the list of epochs missing in the activity table. Internal.
- `/api/v1/score/health`: Retrieve status and flag about the database sync process. Internal.
- `/api/v1/score/`: Retrieve scores. Internal.
- `/api/v1/validators/import`: Import the validators JSON files. Internal.
- `/api/v1/validators/balance`: Update balances of the validators. Internal.
- `/api/v1/validators/`: Get the list of validators with their scores.
