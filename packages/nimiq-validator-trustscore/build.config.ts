import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/fetcher',
    'src/score',
    'src/types',
    'src/utils',
  ],
  declaration: 'node16',
  clean: true,
})
