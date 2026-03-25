import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const openAIApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/openai/, ''),
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
        },
      },
    },
  },
})
