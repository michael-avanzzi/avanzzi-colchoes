import { useEffect, useState } from 'react'

import { useCadastros } from '../../hooks/useCadastros'
import { formatarCompleto, formatarMoeda } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/supabase'
import { listarEventos } from '../../services/agendamentos.service'
import {
  CAMPO_ROTULO,
  RESULTADO_ROTULO,
  STATUS_ROTULO,
  TIPO_EVENTO_ROTULO,
  type EventoAgendamento,
  type ResultadoVenda,
  type StatusAtendimento,
} from '../../types/agendamento'

/** Campos internos que não interessam a quem lê o histórico. */
const OCULTOS = new Set([
  'id',
  'criado_em',
  'criado_por',
  'comparecimento_por',
  'comparecimento_em',
  'resultado_por',
  'resultado_em',
])

type Props = { agendamentoId: string; versao: number }

export function Historico({ agendamentoId, versao }: Props) {
  const { nomeVendedor, nomeCategoria } = useCadastros()
  const [eventos, setEventos] = useState<EventoAgendamento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarEventos(agendamentoId)
      .then((lista) => {
        if (!ativo) return
        setEventos(lista)
        setErro(null)
      })
      .catch((error) => ativo && setErro(mensagemDeErro(error)))
    return () => {
      ativo = false
    }
  }, [agendamentoId, versao])

  function formatar(campo: string, valor: unknown): string {
    if (valor === null || valor === undefined || valor === '') return '—'
    switch (campo) {
      case 'inicio':
        return formatarCompleto(String(valor))
      case 'vendedor_id':
        return nomeVendedor(String(valor))
      case 'categoria_id':
        return nomeCategoria(Number(valor)) ?? '—'
      case 'status':
        return STATUS_ROTULO[valor as StatusAtendimento] ?? String(valor)
      case 'resultado':
        return RESULTADO_ROTULO[valor as ResultadoVenda] ?? String(valor)
      case 'valor_venda':
        return formatarMoeda(Number(valor))
      case 'reagendado_de_id':
      case 'reagendado_para_id':
        return 'outro agendamento'
      default:
        return String(valor)
    }
  }

  if (erro) return <p className="alerta alerta-erro">{erro}</p>
  if (!eventos) {
    return (
      <div className="carregando" role="status">
        <span className="spinner" aria-hidden /> Carregando histórico…
      </div>
    )
  }

  return (
    <ol className="historico">
      {eventos.map((ev) => {
        const campos = Object.keys(ev.dados_novos ?? {}).filter((c) => !OCULTOS.has(c) && CAMPO_ROTULO[c])
        const criacao = !ev.dados_anteriores
        return (
          <li key={ev.id} className="historico-item">
            <div className="historico-topo">
              <strong>{TIPO_EVENTO_ROTULO[ev.tipo] ?? ev.tipo}</strong>
              <time dateTime={ev.ocorrido_em}>{formatarCompleto(ev.ocorrido_em)}</time>
            </div>
            <span className="texto-suave">por {ev.usuario_id ? nomeVendedor(ev.usuario_id) : 'sistema'}</span>
            {!criacao && campos.length > 0 && (
              <ul className="historico-campos">
                {campos.map((c) => (
                  <li key={c}>
                    {CAMPO_ROTULO[c]}: <s>{formatar(c, ev.dados_anteriores?.[c])}</s> →{' '}
                    <strong>{formatar(c, ev.dados_novos?.[c])}</strong>
                  </li>
                ))}
              </ul>
            )}
            {ev.motivo && <p className="historico-motivo">Motivo: {ev.motivo}</p>}
          </li>
        )
      })}
    </ol>
  )
}
