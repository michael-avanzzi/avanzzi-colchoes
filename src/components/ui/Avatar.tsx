import { useState } from 'react'

import { urlDaFoto } from '../../lib/fotos'

type Props = {
  nome: string
  fotoPath?: string | null
  tamanho?: number
  className?: string
}

/** Foto do usuário ou, sem foto, a inicial do nome. */
export function Avatar({ nome, fotoPath, tamanho = 36, className = '' }: Props) {
  const url = urlDaFoto(fotoPath)
  const [falhou, setFalhou] = useState<string | null>(null)
  const mostrarFoto = url && falhou !== url

  return (
    <span
      className={`avatar ${className}`}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.42 }}
      aria-hidden
    >
      {mostrarFoto ? (
        <img src={url} alt="" width={tamanho} height={tamanho} loading="lazy" onError={() => setFalhou(url)} />
      ) : (
        nome.trim().charAt(0).toUpperCase()
      )}
    </span>
  )
}
