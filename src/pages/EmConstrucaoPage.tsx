import { Construction } from 'lucide-react'

type Props = {
  titulo: string
  etapa: string
  descricao: string
}

/** Marca as áreas que serão entregues nas próximas etapas. */
export function EmConstrucaoPage({ titulo, etapa, descricao }: Props) {
  return (
    <section className="pagina">
      <header className="pagina-cabecalho">
        <h1>{titulo}</h1>
      </header>
      <div className="vazio">
        <Construction size={40} aria-hidden />
        <strong>Disponível na {etapa}</strong>
        <p>{descricao}</p>
      </div>
    </section>
  )
}
