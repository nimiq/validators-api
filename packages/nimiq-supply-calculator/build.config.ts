import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/utils',
    'src/pow',
    'src/pos',
    'src/constants',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
})
