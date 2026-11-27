type Props = {
  valor: string
  vendedores: { id: string; nome: string }[]
  onChange: (v: string) => void
}

/** Filtro pelos vendedores do Syscol ("" = todos). */
export function FiltroVendedorSyscol({ valor, vendedores, onChange }: Props) {
  return (
    <label className="filtro">
      <span className="sr-only">Vendedor</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar por vendedor">
        <option value="">Todos os vendedores</option>
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>{v.nome}</option>
        ))}
      </select>
    </label>
  )
}
