import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      "/api/auth": {
        target: "http://localhost:4000",
        changeOrigin: true
      },
      "/api/appointments": {
        target: "http://localhost:4001",
        changeOrigin: true
      },
      "/api/doctors": {
        target: "http://localhost:4002",
        changeOrigin: true
      },
      "/api/patients": {
        target: "http://localhost:4003",
        changeOrigin: true
      },
      "/uploads": {
        target: "http://localhost:4003",
        changeOrigin: true
      }
    }
  }
})
