import { useState } from 'react'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)

  const [name, setName] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)

  const handleSaveName = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSavingName(true)
    try {
      await authApi.updateMe({ name: name.trim() })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar nome.')
      setSavingName(false)
      return
    }
    // Name saved successfully — now try to refresh the store
    try {
      const profile = await authApi.me()
      setAuth(profile)
    } catch {
      // Store refresh failed silently — name was saved, user can reload
    }
    toast.success('Nome atualizado com sucesso.')
    setSavingName(false)
  }

  const handleSavePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter ao menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }
    setSavingPassword(true)
    try {
      await authApi.updateMe({ currentPassword, newPassword })
      toast.success('Senha alterada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha.')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleRequestEmailChange = async (e) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    setSendingEmail(true)
    try {
      await authApi.requestEmailChange(newEmail.trim())
      setEmailSent(true)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao solicitar alteração de e-mail.')
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Meu Perfil</h1>

      {/* Dados pessoais */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-medium text-sm text-gray-700">Dados pessoais</h2>
        <form onSubmit={handleSaveName} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">E-mail atual</label>
            <Input
              value={user?.email ?? ''}
              readOnly
              className="bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
          <Button type="submit" disabled={savingName || !name.trim()}>
            {savingName ? 'Salvando...' : 'Salvar nome'}
          </Button>
        </form>
      </div>

      {/* Alterar senha */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-medium text-sm text-gray-700">Alterar senha</h2>
        <form onSubmit={handleSavePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Senha atual</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nova senha</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar nova senha</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </form>
      </div>

      {/* Alterar e-mail */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-medium text-sm text-gray-700">Alterar e-mail</h2>
        {emailSent ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              Link enviado para <span className="font-medium">{newEmail}</span>. Verifique sua caixa de entrada.
            </p>
            <p className="text-xs text-gray-400">
              Em ambiente de desenvolvimento, o link aparece no console do servidor.
            </p>
            <button
              onClick={() => setEmailSent(false)}
              className="text-xs text-blue-600 hover:underline"
            >
              Solicitar novamente
            </button>
          </div>
        ) : (
          <form onSubmit={handleRequestEmailChange} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Novo e-mail</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="novo@email.com"
              />
            </div>
            <Button type="submit" disabled={sendingEmail || !newEmail.trim()}>
              {sendingEmail ? 'Enviando...' : 'Enviar link de confirmação'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
