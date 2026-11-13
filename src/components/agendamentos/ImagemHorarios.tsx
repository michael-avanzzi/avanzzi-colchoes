import { useEffect, useState } from 'react'
import { Download, Share2 } from 'lucide-react'

import { EXPEDIENTE } from '../../config'
import { horariosDoDia } from '../../lib/disponibilidade'
import { canvasParaJpg, desenharHorarios } from '../../lib/imagemHorarios'
import { paraInputData } from '../../lib/datas'
import type { Agendamento } from '../../types/agendamento'
import { Modal } from '../ui/Modal'

type Props = {
  aberto: boolean
  onFechar: () => void
  dia: Date
  vendedorId: string
  vendedorNome: string
  agendamentos: Agendamento[]
}

type Gerada = { blob: Blob; url: string; livres: number }

function nomeArquivo(dia: Date, vendedor: string) {
  const slug = vendedor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `horarios-${paraInputData(dia)}-${slug || 'vendedor'}.jpg`
}

/** Prévia da imagem com os horários livres e ocupados do dia, para baixar ou compartilhar. */
export function ImagemHorarios({ aberto, onFechar, dia, vendedorId, vendedorNome, agendamentos }: Props) {
  const [gerada, setGerada] = useState<Gerada | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    let url: string | null = null
    const horarios = horariosDoDia(dia, vendedorId, agendamentos, EXPEDIENTE)

    document.fonts.ready
      .then(() => canvasParaJpg(desenharHorarios({ dia, vendedor: vendedorNome, horarios })))
      .then((blob) => {
        url = URL.createObjectURL(blob)
        if (ativo) setGerada({ blob, url, livres: horarios.filter((h) => h.livre).length })
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Não foi possível gerar a imagem.')
      })

    return () => {
      ativo = false
      if (url) URL.revokeObjectURL(url)
      setGerada(null)
      setErro(null)
    }
  }, [aberto, dia, vendedorId, vendedorNome, agendamentos])

  const arquivo = gerada ? new File([gerada.blob], nomeArquivo(dia, vendedorNome), { type: 'image/jpeg' }) : null
  const podeCompartilhar = Boolean(arquivo && navigator.canShare?.({ files: [arquivo] }))

  function baixar() {
    if (!gerada || !arquivo) return
    const a = document.createElement('a')
    a.href = gerada.url
    a.download = arquivo.name
    document.body.append(a)
    a.click()
    a.remove()
  }

  async function compartilhar() {
    if (!arquivo) return
    try {
      await navigator.share({ files: [arquivo] })
    } catch (e) {
      // Cancelar o compartilhamento não é erro.
      if (e instanceof DOMException && e.name === 'AbortError') return
      baixar()
    }
  }

  return (
    <Modal titulo="Imagem dos horários" aberto={aberto} onFechar={onFechar}>
      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
      {!gerada && !erro && <span className="spinner" role="status" aria-label="Gerando imagem" />}
      {gerada && (
        <>
          <p className="texto-suave">
            {gerada.livres === 0
              ? `${vendedorNome} não tem horários livres neste dia.`
              : `${gerada.livres} ${gerada.livres === 1 ? 'horário livre' : 'horários livres'} para ${vendedorNome}.`}
          </p>
          <img className="previa-horarios" src={gerada.url} alt={`Horários de ${vendedorNome}`} />
          <div className="detalhe-acoes">
            {podeCompartilhar && (
              <button type="button" className="botao botao-whatsapp" onClick={() => void compartilhar()}>
                <Share2 size={18} aria-hidden /> Compartilhar
              </button>
            )}
            <button
              type="button"
              className={podeCompartilhar ? 'botao botao-secundario' : 'botao botao-primario'}
              onClick={baixar}
            >
              <Download size={18} aria-hidden /> Baixar JPG
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
