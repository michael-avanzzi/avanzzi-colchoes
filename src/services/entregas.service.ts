import { supabase } from '../lib/supabase'

/** Situação do item no Syscol (código "entrega" de pedidos_itens, a confirmar com a Fábrica de Sistemas). */
export type SituacaoItem = 'entregue' | 'em_carga' | 'disponivel' | 'aguardando_fabricar' | 'brinde' | 'outro'

/** Estoque em linguagem simples: ok (já está com o pedido), tem_no_estoque (dá para adiantar), sem_estoque. */
export type EstoqueItem = 'ok' | 'tem_no_estoque' | 'sem_estoque'

export type ItemEntrega = {
  descricao: string
  quantidade: number
  situacao: SituacaoItem
  codigo: string | null
  previsao_fabricante: string | null
  tem_pedido_compra: boolean
  estoque_saldo: number
  estoque_livre: number
  estoque: EstoqueItem
}

export type Prontidao = 'entregue' | 'pronto' | 'aguardando' | 'risco'

export type Entrega = {
  numero: string
  data_entrega: string
  /** "minuta" = data da ficha de entrega; "prometida" = data prometida no pedido. */
  origem_data: 'minuta' | 'prometida'
  hora: string | null
  observacao_entrega: string | null
  cliente: string | null
  telefone: string | null
  endereco: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  ponto_referencia: string | null
  carga_id: number | null
  ordem_entrega: number | null
  carga_descricao: string | null
  carga_status: number | null
  carga_saida: string | null
  carga_concluida: boolean
  carga_km: number | null
  itens: ItemEntrega[]
  total_itens: number
  entregues: number
  aguardando: number
  em_carga: number
  previsao_fabricante: string | null
  prontidao: Prontidao
  aguardando_com_estoque: number
  vendedor: string | null
  atrasada: boolean
}

export type Entregas = {
  hoje: string
  papel: string
  /** Vê as entregas de todos (logística, gerente, admin). */
  todos: boolean
  /** Vendedor ligado a um vendedor do Syscol (sem isso não há entregas para mostrar). */
  vinculado: boolean
  periodo: { inicio: string; fim: string }
  entregas: Entrega[]
  atrasadas: Entrega[]
  vendedores: { id: string; nome: string }[] | null
}

/** Datas AAAA-MM-DD. Toda a regra (quem vê o quê, data da entrega, prontidão) fica no banco. */
export async function obterEntregas(inicio: string, fim: string, vendedorId: string | null): Promise<Entregas> {
  const { data, error } = await supabase.rpc('rpc_entregas', {
    p_inicio: inicio,
    p_fim: fim,
    p_vendedor_id: vendedorId,
  })
  if (error) throw error
  return data as Entregas
}
