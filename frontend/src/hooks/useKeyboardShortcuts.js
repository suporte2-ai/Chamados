// frontend/src/hooks/useKeyboardShortcuts.js
import { useEffect } from 'react'

export function useKeyboardShortcuts({ onOpenSearch, onNewTicket, onOpenHelp, navigate }) {
  useEffect(() => {
    const handler = (e) => {
      // Ignore se estiver digitando em input/textarea/contenteditable
      const tag = document.activeElement?.tagName
      const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        document.activeElement?.isContentEditable

      if (e.key === '?' && !isEditing) {
        e.preventDefault()
        onOpenHelp()
      }
      if (e.key === 'n' && !isEditing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onNewTicket()
      }
      // '/' para focar busca (mesma função do Ctrl+K)
      if (e.key === '/' && !isEditing) {
        e.preventDefault()
        onOpenSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpenSearch, onNewTicket, onOpenHelp, navigate])
}
