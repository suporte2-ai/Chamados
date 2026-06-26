import { formatTicketId, timeAgo, SLA_BADGE_COLORS } from './utils'

test('formatTicketId formata com 5 dígitos e # prefixo', () => {
  expect(formatTicketId(1)).toBe('#00001')
  expect(formatTicketId(142)).toBe('#00142')
  expect(formatTicketId(10000)).toBe('#10000')
})

test('timeAgo retorna string legível', () => {
  const result = timeAgo(new Date(Date.now() - 5 * 60000).toISOString())
  expect(typeof result).toBe('string')
  expect(result.length).toBeGreaterThan(0)
})

test('SLA_BADGE_COLORS tem chaves vermelho, amarelo, verde', () => {
  expect(SLA_BADGE_COLORS.vermelho).toBeDefined()
  expect(SLA_BADGE_COLORS.amarelo).toBeDefined()
  expect(SLA_BADGE_COLORS.verde).toBeDefined()
})
