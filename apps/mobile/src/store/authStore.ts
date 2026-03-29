import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';

type AuthState = {
  user: FirebaseUser | null;
  setUser: (user: FirebaseUser | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
