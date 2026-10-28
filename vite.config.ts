import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: { port: 3000 },
  preview: { allowedHosts: ['sb-189u4o9cg2fd.vercel.run'] },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(),
    // Must run after TanStack Start (official TanStack Vite setup).
    viteReact(),
  ],
})
