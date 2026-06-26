import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTicketId(id) {
  return `#${String(id).padStart(5, '0')}`
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

export const SLA_BADGE_COLORS = {
  vermelho: 'bg-red-100 text-red-700 border-red-200',
  amarelo: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  verde: 'bg-green-100 text-green-700 border-green-200',
}

export const STATUS_COLORS = {
  ABERTO: 'bg-blue-100 text-blue-700',
  EM_ANDAMENTO: 'bg-purple-100 text-purple-700',
  AGUARDANDO: 'bg-orange-100 text-orange-700',
  RESOLVIDO: 'bg-green-100 text-green-700',
  FECHADO: 'bg-gray-100 text-gray-700',
}

export const STATUS_LABELS = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em Andamento',
  AGUARDANDO: 'Aguardando',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
}

export const URGENCY_COLORS = {
  CRITICO: 'bg-red-100 text-red-700',
  ALTO: 'bg-orange-100 text-orange-700',
  MEDIO: 'bg-yellow-100 text-yellow-700',
  BAIXO: 'bg-green-100 text-green-700',
}

export const URGENCY_LABELS = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
}
