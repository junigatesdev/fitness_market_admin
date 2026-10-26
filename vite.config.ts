/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://<user>.github.io/fitness_market_admin/ on GitHub Pages.
  base: '/fitness_market_admin/',
  plugins: [react()],
  test: { environment: 'jsdom', globals: false },
});
