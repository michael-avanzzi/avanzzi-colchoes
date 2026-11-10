import { useCallback, useEffect, useState } from 'react'

import { listarCategorias, listarVendedores } from '../services/agendamentos.service'
import type { Categoria, Vendedor } from '../types/agendamento'

type Cadastros = { categorias: Categoria[]; vendedores: Vendedor[] }

let cache: Promise<Cadastros> | null = null

function carregar() {
  cache ??= Promise.all([listarCategorias(), listarVendedores()])
    .then(([categorias, vendedores]) => ({ categorias, vendedores }))
    .catch((error) => {
      cache = null // tenta de novo na próxima vez
      throw error
    })
  return cache
}

/** Categorias e usuários (para nomes de vendedores), carregados uma vez por sessão. */
export function useCadastros() {
  const [dados, setDados] = useState<Cadastros>({ categorias: [], vendedores: [] })

  useEffect(() => {
    let ativo = true
    carregar()
      .then((d) => ativo && setDados(d))
      .catch((error) => console.error('[Cadastros]', error))
    return () => {
      ativo = false
    }
  }, [])

  const nomeVendedor = useCallback(
    (id: string | null | undefined) => dados.vendedores.find((v) => v.id === id)?.nome ?? '—',
    [dados.vendedores],
  )
  const nomeCategoria = useCallback(
    (id: number | null | undefined) => dados.categorias.find((c) => c.id === id)?.nome ?? null,
    [dados.categorias],
  )

  return { ...dados, nomeVendedor, nomeCategoria }
}

/** Limpa o cache (ex.: depois de criar ou editar um usuário). */
export function invalidarCadastros() {
  cache = null
}
