import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Props = {
  titulo: string
  aberto: boolean
  onFechar: () => void
  children: ReactNode
}

/** Diálogo nativo (<dialog>): foco preso, Esc fecha e funciona com leitor de tela. */
export function Modal({ titulo, aberto, onFechar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (aberto && !dialog.open) dialog.showModal()
    if (!aberto && dialog.open) dialog.close()
  }, [aberto])

  return (
    <dialog ref={ref} className="modal" onClose={onFechar} aria-labelledby="modal-titulo">
      {aberto && (
        <div className="modal-corpo">
          <header className="modal-cabecalho">
            <h2 id="modal-titulo">{titulo}</h2>
            <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar">
              <X size={20} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
