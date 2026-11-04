import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load GEMINI_API_KEY from .env / .env.local (or the shell) so the browser
  // code's `process.env.GEMINI_API_KEY` resolves outside AI Studio too.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
    },
    build: {
      rollupOptions: {
        output: {
          // Split big libraries into their own long-cached chunks.
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            genai: ['@google/genai'],
            motion: ['motion/react'],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  }
})
