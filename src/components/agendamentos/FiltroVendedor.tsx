import { useCadastros } from '../../hooks/useCadastros'

type Props = { valor: string; onChange: (v: string) => void }

/** "" = todos; "eu" é tratado pela tela como o usuário logado. */
export function FiltroVendedor({ valor, onChange }: Props) {
  const { vendedores } = useCadastros()
  return (
    <label className="filtro">
      <span className="sr-only">Vendedor</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar por vendedor">
        <option value="">Todos os vendedores</option>
        {vendedores
          .filter((v) => v.ativo)
          .map((v) => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
      </select>
    </label>
  )
}
