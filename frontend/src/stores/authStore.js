import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: null,
  permissions: new Set(),
  fieldVisibilities: new Set(),
  setAuth: (payload) =>
    set({
      user: payload.user,
      permissions: new Set(payload.permissions),
      fieldVisibilities: new Set(payload.fieldVisibilities),
    }),
  clear: () =>
    set({ user: null, permissions: new Set(), fieldVisibilities: new Set() }),
}))
