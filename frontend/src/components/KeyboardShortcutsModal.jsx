// frontend/src/components/KeyboardShortcutsModal.jsx
import { X } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'],   label: 'Abrir busca global' },
  { keys: ['/'],           label: 'Abrir busca global' },
  { keys: ['N'],           label: 'Novo chamado' },
  { keys: ['?'],           label: 'Exibir atalhos de teclado' },
  { keys: ['Esc'],         label: 'Fechar modal/busca' },
]

export default function KeyboardShortcutsModal({ open, onClose }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm text-foreground">Atalhos de teclado</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="font-mono text-xs bg-muted border border-border px-2 py-0.5 rounded text-muted-foreground">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
