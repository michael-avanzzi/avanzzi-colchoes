export type Papel = 'vendedor' | 'gerente' | 'admin'

export const PAPEL_ROTULO: Record<Papel, string> = {
  vendedor: 'Vendedor',
  gerente: 'Gerente',
  admin: 'Administrador',
}

/** Retorno de rpc_meu_perfil. */
export type MeuPerfil =
  | {
      allowed: true
      id: string
      nome: string
      email: string
      telefone: string | null
      papel: Papel
      foto_path?: string | null
      trocar_senha: boolean
    }
  | {
      allowed: false
      nome?: string
      email?: string
      message: string
    }
