/** Marca do app: ícone (A vermelho na nuvem, com o "zz" do sono) + "Avanzzi Mobile". */
export function Logo({ grande = false }: { grande?: boolean }) {
  return (
    <div className={grande ? 'logo logo-grande' : 'logo'}>
      <img src="/icons/icon.svg" alt="" width={grande ? 48 : 32} height={grande ? 48 : 32} />
      <div className="logo-texto" aria-label="Avanzzi Mobile">
        <strong className="logo-nome" aria-hidden>
          Avan<span className="logo-zz">zz</span>i
        </strong>
        <span aria-hidden>Mobile</span>
      </div>
    </div>
  )
}
