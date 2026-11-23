import { Volume2, VolumeX } from 'lucide-react'

import type { useSom } from '../../hooks/useSom'

/** Botão de ligar/desligar o som dos avisos. */
export function BotaoSom({ som, className = 'botao-icone' }: { som: ReturnType<typeof useSom>; className?: string }) {
  const rotulo = som.ligado ? 'Desligar o som dos avisos' : 'Ligar o som dos avisos'
  return (
    <button type="button" className={className} onClick={som.alternar} aria-label={rotulo} title={rotulo} aria-pressed={som.ligado}>
      {som.ligado ? <Volume2 size={20} /> : <VolumeX size={20} />}
    </button>
  )
}
