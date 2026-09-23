import { describe, expect, it } from 'vitest'
import {
  createScoreVersionRequestQuery,
  mergeScoreVersionQuery,
  parseScoreVersion,
  resolveDashboardScoreVersion,
} from './score-version'

describe('score version route query', () => {
  it('accepts only one exact v1 or v2 query value', () => {
    expect(parseScoreVersion('1')).toBe(1)
    expect(parseScoreVersion('2')).toBe(2)
    expect(parseScoreVersion('3')).toBeUndefined()
    expect(parseScoreVersion(['2'])).toBeUndefined()
    expect(parseScoreVersion(undefined)).toBeUndefined()
  })

  it('falls back to the API-selected version for missing or invalid queries', () => {
    expect(resolveDashboardScoreVersion(undefined, 2)).toBe(2)
    expect(resolveDashboardScoreVersion('invalid', 1)).toBe(1)
    expect(resolveDashboardScoreVersion('2', 1)).toBe(2)
  })

  it('omits invalid values from API requests', () => {
    expect(createScoreVersionRequestQuery('1')).toEqual({ 'score-version': 1 })
    expect(createScoreVersionRequestQuery('2')).toEqual({ 'score-version': 2 })
    expect(createScoreVersionRequestQuery('invalid')).toEqual({})
  })

  it('preserves unrelated route query values when changing version', () => {
    expect(mergeScoreVersionQuery({
      'search': 'nimiq',
      'page': '2',
      'score-version': '1',
    }, 2)).toEqual({
      'search': 'nimiq',
      'page': '2',
      'score-version': '2',
    })
  })
})
