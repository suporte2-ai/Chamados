import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } catch (_) {}
    // Backend sempre retorna 200 (anti-enumeração) — mostrar mensagem de sucesso sempre
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">E-mail enviado</h2>
          <p className="text-sm text-gray-600 mb-4">
            Se o e-mail informado estiver cadastrado, você receberá as instruções em breve.
          </p>
          <Button variant="outline" onClick={() => navigate('/login')}>Voltar ao login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-xl font-bold mb-2">Recuperar senha</h1>
        <p className="text-sm text-gray-600 mb-4">Informe seu e-mail para receber o link de recuperação.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="seu@email.com"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar link'}
          </Button>
        </form>
        <button
          onClick={() => navigate('/login')}
          className="block text-center text-sm text-blue-600 hover:underline mt-4 w-full"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  )
}
