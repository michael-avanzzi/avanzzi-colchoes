/** Logotipo provisório até recebermos os arquivos oficiais da marca. */
export function Logo({ grande = false }: { grande?: boolean }) {
  return (
    <div className={grande ? 'logo logo-grande' : 'logo'}>
      <img src="/icons/icon.svg" alt="" width={grande ? 48 : 32} height={grande ? 48 : 32} />
      <div className="logo-texto">
        <strong>AVANZZI</strong>
        <span>Agendamentos</span>
      </div>
    </div>
  )
}
