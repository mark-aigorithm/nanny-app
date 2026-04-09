/**
 * Minimal web stub for expo-router used during Vite preview builds.
 * Provides no-op router hooks so screen components can render in isolation.
 */
export function useRouter() {
  return {
    push: (route: any) => console.log('[preview] router.push', route),
    replace: (route: any) => console.log('[preview] router.replace', route),
    back: () => console.log('[preview] router.back'),
    canGoBack: () => false,
  };
}

export function useLocalSearchParams<T = Record<string, string>>(): T {
  return {} as T;
}

export function useGlobalSearchParams<T = Record<string, string>>(): T {
  return {} as T;
}

export function Link(props: any) {
  return null;
}
