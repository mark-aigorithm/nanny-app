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
      // Stub @expo/vector-icons with a web-compatible mock (avoids JSX parse errors in .js files)
      '@expo/vector-icons': path.resolve(__dirname, 'src/mocks/expo-vector-icons-web.tsx'),
      // Stub expo-linear-gradient (ships JSX in .js files)
      'expo-linear-gradient': path.resolve(__dirname, 'src/mocks/expo-linear-gradient-web.tsx'),
      // Stub expo-router (ships JSX in .js files, provides no-op hooks for preview)
      'expo-router': path.resolve(__dirname, 'src/mocks/expo-router-web.tsx'),
      // Stub expo-clipboard (ClipboardPasteButton ships JSX in .js files)
      'expo-clipboard': path.resolve(__dirname, 'src/mocks/expo-clipboard-web.tsx'),
      // Stub expo-constants (pulls in expo-modules-core, whose .ts declaration
      // files fail to bundle) — screens only read expoConfig.extra
      'expo-constants': path.resolve(__dirname, 'src/mocks/expo-constants-web.tsx'),
      // Stub the Firebase wrapper — it initialises at import time and throws
      // without real credentials, which prevents the preview from mounting
      '@mobile/lib/firebase': path.resolve(__dirname, 'src/mocks/firebase-web.tsx'),
      // Stub the native messaging SDK — usePushNotifications requires it
      // lazily, but the bundler still resolves it, and it imports
      // `react-native/Libraries/...` paths that do not exist on web. Anything
      // importing `useAuth` (every auth screen) pulls it in transitively.
      '@react-native-firebase/messaging': path.resolve(
        __dirname,
        'src/mocks/firebase-messaging-web.tsx',
      ),
      // Same story: lazily required by usePushNotifications, but resolved by
      // the bundler, and it drags in expo-modules-core's unbundlable .ts
      // declaration files.
      'expo-notifications': path.resolve(__dirname, 'src/mocks/expo-notifications-web.tsx'),
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
