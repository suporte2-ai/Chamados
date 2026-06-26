import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { rolesApi } from '@/api/roles'
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminRolesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: roles = [], isLoading } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })

  const handleDelete = async (role) => {
    if (!window.confirm(`Excluir o perfil "${role.name}"?`)) return
    try {
      await rolesApi.remove(role.id)
      toast.success('Perfil excluído.')
      qc.invalidateQueries({ queryKey: ['roles'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir.')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Perfis de Acesso</h1>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Nome', 'Nível', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 3 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}</tr>
              ))
              : roles.map(role => (
                <tr key={role.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{role.name}</td>
                  <td className="px-4 py-3 text-gray-500">{role.level}</td>
                  <td className="px-4 py-3 flex gap-3">
                    <button
                      onClick={() => navigate(`/admin/roles/${role.id}`)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar permissões
                    </button>
                    {!role.isSystemDefault && (
                      <button onClick={() => handleDelete(role)} className="text-red-500 hover:underline text-xs">
                        Excluir
                      </button>
                    )}
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
