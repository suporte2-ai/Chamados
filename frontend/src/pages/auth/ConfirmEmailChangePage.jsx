import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'

export default function ConfirmEmailChangePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    authApi.confirmEmailChange(token)
      .then((data) => {
        setMessage(data.message)
        setState('success')
      })
      .catch((err) => {
        setMessage(err.response?.data?.error || 'Link inválido ou expirado.')
        setState('error')
      })
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 text-center">
        {state === 'loading' && (
          <>
            <h2 className="text-xl font-semibold mb-2">Verificando...</h2>
            <p className="text-sm text-gray-500">Aguarde enquanto confirmamos seu novo e-mail.</p>
          </>
        )}
        {state === 'success' && (
          <>
            <h2 className="text-xl font-semibold mb-2">E-mail atualizado com sucesso!</h2>
            <p className="text-sm text-gray-600 mb-4">{message}</p>
            <Button onClick={() => navigate('/perfil')}>Ir para meu perfil</Button>
          </>
        )}
        {state === 'error' && (
          <>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Erro</h2>
            <p className="text-sm text-gray-600 mb-4">{message}</p>
            <Button variant="outline" onClick={() => navigate('/perfil')}>Ir para meu perfil</Button>
          </>
        )}
      </div>
    </div>
  )
}
