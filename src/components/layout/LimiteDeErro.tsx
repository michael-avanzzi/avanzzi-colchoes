import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

import { registrarErro } from '../../lib/erros'

type Props = { children: ReactNode }
type Estado = { erro: Error | null }

/** Evita tela em branco: mostra uma mensagem e registra o erro para a equipe. */
export class LimiteDeErro extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    registrarErro(
      Object.assign(erro, { stack: `${erro.stack ?? ''}\n--- componentes ---${info.componentStack ?? ''}` }),
      'tela',
    )
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="tela-cheia">
        <div className="vazio erro-tela" role="alert">
          <strong>Algo deu errado nesta tela.</strong>
          <p>O problema foi registrado para a equipe. Recarregue para continuar de onde parou.</p>
          <button type="button" className="botao botao-primario" onClick={() => window.location.reload()}>
            <RotateCcw size={18} aria-hidden /> Recarregar
          </button>
        </div>
      </div>
    )
  }
}
