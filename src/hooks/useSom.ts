import { useEffect, useState } from 'react'

import { aoMudarEstadoDoSom, definirSomLigado, prepararSom, somBloqueado, somLigado, tocarMeta } from '../lib/sons'

/** Estado do som dos avisos: ligado/desligado (preferência da tela) e se o navegador já liberou o áudio. */
export function useSom() {
  const [ligado, setLigado] = useState(somLigado)
  const [bloqueado, setBloqueado] = useState(somBloqueado)

  useEffect(() => {
    const parar = prepararSom()
    const sair = aoMudarEstadoDoSom(() => setBloqueado(somBloqueado()))
    return () => {
      parar()
      sair()
    }
  }, [])

  function alternar() {
    const novo = !ligado
    definirSomLigado(novo)
    setLigado(novo)
    // O próprio clique libera o áudio; toca um trecho para confirmar que está funcionando.
    if (novo) window.setTimeout(tocarMeta, 150)
  }

  return { ligado, bloqueado, alternar }
}
