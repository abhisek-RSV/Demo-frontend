import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The WAR is deployed to Tomcat at /demo-app/
  base: '/demo-app/',
  server: {
    proxy: {
      // Backend running locally via ./mvnw spring-boot:run (port 8090)
      '/demo-app/api': 'http://localhost:8090',
    },
  },
})
