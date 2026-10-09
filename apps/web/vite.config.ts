import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development Vite serves the app on :5173 and proxies API + WebSocket
// traffic to the Fastify server on :3000. In production the server serves the
// built files itself (apps/web/dist), so there is only one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000' },
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  preview: { port: 4174 },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: true,
    rolldownOptions: {
      output: {
        // Stable vendor chunks: they change rarely, so browsers keep them cached across app deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            {
              name: 'realtime',
              test: /node_modules[\\/](socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io)[\\/]/,
            },
            { name: 'ui', test: /node_modules[\\/](radix-ui|@radix-ui|@floating-ui|lucide-react)[\\/]/ },
            { name: 'data', test: /node_modules[\\/](@tanstack|zustand)[\\/]/ },
          ],
        },
      },
    },
  },
});
