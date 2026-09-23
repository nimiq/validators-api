import type { ScoreVersion } from '~/utils/score-version'
import {
  createScoreVersionRequestQuery,
  mergeScoreVersionQuery,
  parseScoreVersion,
} from '~/utils/score-version'

export function useScoreVersionQuery() {
  const route = useRoute()

  const requestedScoreVersion = computed(() =>
    parseScoreVersion(route.query['score-version']),
  )
  const scoreVersionRequestQuery = computed(() =>
    createScoreVersionRequestQuery(route.query['score-version']),
  )

  async function setScoreVersion(scoreVersion: ScoreVersion) {
    await navigateTo({
      path: route.path,
      query: mergeScoreVersionQuery(route.query, scoreVersion),
    }, { replace: true })
  }

  return {
    requestedScoreVersion,
    scoreVersionRequestQuery,
    setScoreVersion,
  }
}
