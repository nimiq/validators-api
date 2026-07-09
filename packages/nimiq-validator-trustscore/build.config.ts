import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/fetcher',
    'src/score',
    'src/types',
    'src/range',
    'src/epoch-status',
  ],
  declaration: 'node16',
  clean: true,
})
