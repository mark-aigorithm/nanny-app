import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Renders a component inside the providers the app supplies at runtime.
 *
 * Every feature module is built on React Query, so a bare `render` throws on
 * the first hook. Centralising it here also keeps the test-only QueryClient
 * settings in one place.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Without this, a test asserting an error state waits through three
        // silent retries before the failure surfaces — usually as a timeout
        // that looks nothing like the assertion that actually failed.
        retry: false,
        // Each test builds a fresh client, so caching across them is not
        // possible anyway; turning it off makes that explicit.
        gcTime: 0,
      },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}
