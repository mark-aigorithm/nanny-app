import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite config for standalone component preview (react-native-web).
// Used by the `preview:web` script — not part of the Expo build pipeline.
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  resolve: {
    // Redirect react-native imports to react-native-web
    alias: {
      'react-native': 'react-native-web',
    },
    // Prefer .web.* extensions, then TypeScript, then JS
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
  define: {
    // Required by react-native-web internals
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    __DEV__: JSON.stringify(false),
    global: 'globalThis',
  },
  build: {
    outDir: 'dist/preview',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'preview-index.html'),
    },
  },
  // No HMR — headless build only
  server: {
    hmr: false,
  },
});
