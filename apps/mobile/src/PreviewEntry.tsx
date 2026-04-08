/**
 * PreviewEntry — browser entry point for isolated component previews.
 *
 * The component to preview is determined at build time by
 * `scripts/generate-preview-entry.js`, which writes
 * `src/preview-entry-generated.tsx` before Vite runs.
 *
 * Run the full pipeline via:
 *   COMPONENT=src/components/Foo.tsx npm run preview:web
 */
import React from 'react';
import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PreviewComponent from './preview-entry-generated';

function PreviewApp() {
  return (
    <SafeAreaProvider>
      <PreviewComponent />
    </SafeAreaProvider>
  );
}

AppRegistry.registerComponent('PreviewApp', () => PreviewApp);
AppRegistry.runApplication('PreviewApp', {
  rootTag: document.getElementById('root'),
});
