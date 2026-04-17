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
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/auth": {
        target: "http://localhost:4000",
        changeOrigin: true
      },
      "/api/appointments": {
        target: "http://localhost:4001",
        changeOrigin: true
      },
      "/socket.io": {
        target: "http://localhost:4001",
        changeOrigin: true,
        ws: true
      },
      "/api/doctors": {
        target: "http://localhost:4002",
        changeOrigin: true
      },
      "/api/patients": {
        target: "http://localhost:4003",
        changeOrigin: true
      },
      "/api/telemedicine": {
        target: "http://localhost:4004",
        changeOrigin: true
      },
      "/api/ai": {
        target: "http://localhost:4005",
        changeOrigin: true
      },
      "/api/payments": {
        target: "http://localhost:4006",
        changeOrigin: true
      },
      "/api/notifications": {
        target: "http://localhost:4007",
        changeOrigin: true
      },
      "/uploads": {
        target: "http://localhost:4003",
        changeOrigin: true
      },
      "/health/auth": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/appointments": {
        target: "http://localhost:4001",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/doctors": {
        target: "http://localhost:4002",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/patients": {
        target: "http://localhost:4003",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/telemedicine": {
        target: "http://localhost:4004",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/ai": {
        target: "http://localhost:4005",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/payments": {
        target: "http://localhost:4006",
        changeOrigin: true,
        rewrite: () => "/health"
      },
      "/health/notifications": {
        target: "http://localhost:4007",
        changeOrigin: true,
        rewrite: () => "/health"
      }
    }
  }
})
