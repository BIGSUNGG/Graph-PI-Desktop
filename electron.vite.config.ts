import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const contract = resolve('src/main/contract.ts')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@contract': contract }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@contract': contract }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: { '@contract': contract }
    }
  }
})
