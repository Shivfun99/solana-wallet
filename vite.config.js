import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
      stream: 'stream-browserify',
      assert: 'assert',
      crypto: 'crypto-browserify'
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'stream', 'assert', 'crypto'],
  },
  build: {
    target: 'es2022',  // <-- add this line to enable top-level await support
  }
})
