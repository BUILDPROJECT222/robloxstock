import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // relative paths so the build works from any static host / sub-folder (e.g. GitHub Pages)
  base: './',
  build: {
    chunkSizeWarningLimit: 700, // three.js alone is ~570 kB
    rolldownOptions: {
      output: {
        // keep the big vendor libraries in their own cacheable chunks
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three/ },
            { name: 'solana', test: /node_modules[\\/](@solana|@wallet-standard|bn\.js|bs58|buffer|rpc-websockets|superstruct|@noble)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/ },
          ],
        },
      },
    },
  },
});
