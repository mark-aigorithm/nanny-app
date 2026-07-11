// Ambient type for the preview entry module that
// `scripts/generate-preview-entry.js` writes at build time
// (`src/preview-entry-generated.tsx` is gitignored and absent during a normal
// typecheck). When the concrete file exists, its own types take precedence.
declare module '*/preview-entry-generated' {
  import type { ComponentType } from 'react';
  const PreviewComponent: ComponentType;
  export default PreviewComponent;
}
