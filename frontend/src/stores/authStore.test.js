import { renderHook, act } from '@testing-library/react'
import { useAuthStore } from './authStore'

beforeEach(() => {
  useAuthStore.setState({ user: null, permissions: new Set(), fieldVisibilities: new Set() })
})

test('setAuth popula user, permissions e fieldVisibilities como Set', () => {
  const { result } = renderHook(() => useAuthStore())
  act(() => {
    result.current.setAuth({
      user: { id: 1, name: 'Ana', email: 'a@b.com', role: 'Administrador' },
      permissions: ['view_tickets', 'close_tickets'],
      fieldVisibilities: ['assigned_to', 'sla_badge'],
    })
  })
  expect(result.current.user).toEqual({ id: 1, name: 'Ana', email: 'a@b.com', role: 'Administrador' })
  expect(result.current.permissions.has('view_tickets')).toBe(true)
  expect(result.current.permissions.has('close_tickets')).toBe(true)
  expect(result.current.fieldVisibilities.has('assigned_to')).toBe(true)
  expect(result.current.fieldVisibilities.has('sla_badge')).toBe(true)
})

test('clear zera user, permissions e fieldVisibilities', () => {
  const { result } = renderHook(() => useAuthStore())
  act(() => {
    result.current.setAuth({
      user: { id: 1, name: 'Ana', email: 'a@b.com', role: 'Administrador' },
      permissions: ['view_tickets'],
      fieldVisibilities: ['assigned_to'],
    })
  })
  act(() => { result.current.clear() })
  expect(result.current.user).toBeNull()
  expect(result.current.permissions.size).toBe(0)
  expect(result.current.fieldVisibilities.size).toBe(0)
})
