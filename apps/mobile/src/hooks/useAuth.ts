import { useMutation } from '@tanstack/react-query';
import { api } from '@mobile/lib/api';

export function useForgotPassword() {
  // TODO: wire to POST /auth/forgot-password via api
  return useMutation({
    mutationFn: async (_email: string) => {
      // stub — replace with: await api.post('/auth/forgot-password', { email })
      void api;
    },
  });
}

export function useSignIn() {
  // TODO: wire to Firebase Auth signInWithEmailAndPassword
  const mutation = useMutation({
    mutationFn: async (_credentials: { email: string; password: string }) => {
      // stub — replace with Firebase sign-in call
      void api;
    },
  });

  return {
    ...mutation,
    mutate: (
      email: string,
      password: string,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => mutation.mutate({ email, password }, options),
  };
}
