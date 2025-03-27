import type { SelectedValidator, UnselectedValidator } from 'nimiq-validator-trustscore/types'

export enum PayoutType {
  Restake = 'restake',
  Direct = 'direct',
  None = 'none',
}

export interface CurrentEpochValidators {
  epochNumber: number
  selectedValidators: (SelectedValidator | UnselectedValidator)[]
  validators: {
    selectedTrackedValidators: SelectedValidator[]
    unselectedTrackedValidators: UnselectedValidator[]
    selectedUntrackedValidators: SelectedValidator[]
    unselectedUntrackedValidators: UnselectedValidator[]
  }
}
