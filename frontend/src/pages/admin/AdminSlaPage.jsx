import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { slaApi } from '@/api/sla'
import { Skeleton } from '@/components/ui/skeleton'
import { URGENCY_LABELS } from '@/lib/utils'

const URGENCY_ORDER = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO']

export default function AdminSlaPage() {
  const qc = useQueryClient()
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['sla-config'],
    queryFn: slaApi.list,
  })
  const [values, setValues] = useState({})

  useEffect(() => {
    if (configs.length > 0) {
      const v = {}
      configs.forEach(c => {
        v[c.urgency] = {
          firstResponseHours: c.firstResponseHours,
          resolutionHours: c.resolutionHours,
        }
      })
      setValues(v)
    }
  }, [configs])

  const handleBlur = async (urgency, field, rawValue) => {
    const num = parseFloat(rawValue)
    if (isNaN(num) || num <= 0) {
      toast.error('Valor inválido.')
      return
    }
    try {
      await slaApi.update(urgency, { [field]: num })
      toast.success(`SLA ${URGENCY_LABELS[urgency]} atualizado.`)
      qc.invalidateQueries({ queryKey: ['sla-config'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Configuração de SLA</h1>
      <p className="text-sm text-gray-500">Clique fora do campo para salvar automaticamente.</p>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Urgência', 'Primeira resposta (h)', 'Resolução (h)'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{[1,2,3].map(j => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-8 w-20" /></td>
                ))}</tr>
              ))
              : URGENCY_ORDER.map(urgency => (
                <tr key={urgency}>
                  <td className="px-4 py-3 font-medium">{URGENCY_LABELS[urgency]}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={values[urgency]?.firstResponseHours ?? ''}
                      onChange={e => setValues(v => ({
                        ...v,
                        [urgency]: { ...v[urgency], firstResponseHours: e.target.value },
                      }))}
                      onBlur={e => handleBlur(urgency, 'firstResponseHours', e.target.value)}
                      className="border rounded-md px-3 py-1.5 text-sm w-24"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={values[urgency]?.resolutionHours ?? ''}
                      onChange={e => setValues(v => ({
                        ...v,
                        [urgency]: { ...v[urgency], resolutionHours: e.target.value },
                      }))}
                      onBlur={e => handleBlur(urgency, 'resolutionHours', e.target.value)}
                      className="border rounded-md px-3 py-1.5 text-sm w-24"
                    />
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
