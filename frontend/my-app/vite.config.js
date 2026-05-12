import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'paper-fetch-proxy',
      configureServer(server) {
        server.middlewares.use('/paper-fetch', async (req, res) => {
          if (req.method !== 'GET') {
            res.statusCode = 405
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }

          try {
            const requestUrl = new URL(req.url, 'http://localhost')
            const targetUrl = requestUrl.searchParams.get('url')

            if (!targetUrl) {
              res.statusCode = 400
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing url query parameter' }))
              return
            }

            const parsedTarget = new URL(targetUrl)
            if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
              res.statusCode = 400
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: 'Only http/https URLs are allowed' }))
              return
            }

            const upstream = await fetch(parsedTarget.toString(), {
              redirect: 'follow',
              headers: {
                'User-Agent': 'CitationChecker/1.0 (+http://localhost:5173)',
              },
            })

            res.statusCode = upstream.status
            const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8'
            res.setHeader('content-type', contentType)

            const textBody = await upstream.text()
            res.end(textBody)
          } catch (error) {
            res.statusCode = 502
            res.setHeader('content-type', 'application/json')
            res.end(
              JSON.stringify({
                error: 'Upstream fetch failed',
                message: error instanceof Error ? error.message : 'Unknown error',
              })
            )
          }
        })
      },
    },
  ],
  server: {
    proxy: {
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/openai/, ''),
      },
    },
  },
})
