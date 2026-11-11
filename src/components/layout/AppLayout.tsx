import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '../../auth/AuthProvider'
import { PAPEL_ROTULO, type Papel } from '../../types/auth'
import { Avatar } from '../ui/Avatar'
import { Lembretes } from './Lembretes'
import { Logo } from './Logo'
import { MeuPerfil } from './MeuPerfil'

type ItemMenu = {
  to: string
  rotulo: string
  icone: LucideIcon
  papeis?: Papel[]
}

const MENU: ItemMenu[] = [
  { to: '/', rotulo: 'Kanban', icone: KanbanSquare },
  { to: '/calendario', rotulo: 'Calendário', icone: CalendarDays },
  { to: '/painel', rotulo: 'Painel', icone: LayoutDashboard, papeis: ['gerente', 'admin'] },
  { to: '/usuarios', rotulo: 'Usuários', icone: Users, papeis: ['admin'] },
]

export function AppLayout() {
  const { perfil } = useAuth()
  const [perfilAberto, setPerfilAberto] = useState(false)
  if (!perfil?.allowed) return null

  const itens = MENU.filter((item) => !item.papeis || item.papeis.includes(perfil.papel))

  return (
    <div className="app">
      <aside className="barra-lateral" aria-label="Menu principal">
        <div className="barra-topo">
          <Logo />
          <Lembretes claro />
        </div>

        <nav className="menu">
          {itens.map(({ to, rotulo, icone: Icone }) => (
            <NavLink key={to} to={to} end={to === '/'} className="menu-item">
              <Icone size={20} aria-hidden />
              <span>{rotulo}</span>
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="usuario"
          onClick={() => setPerfilAberto(true)}
          aria-label="Meu perfil"
          title="Meu perfil"
        >
          <Avatar nome={perfil.nome} fotoPath={perfil.foto_path} tamanho={36} className="usuario-avatar" />
          <span className="usuario-dados">
            <strong>{perfil.nome}</strong>
            <span>{PAPEL_ROTULO[perfil.papel]}</span>
          </span>
        </button>
      </aside>

      <main className="conteudo">
        <Outlet />
      </main>

      <nav className="menu-inferior" aria-label="Menu principal">
        {itens.map(({ to, rotulo, icone: Icone }) => (
          <NavLink key={to} to={to} end={to === '/'} className="menu-inferior-item">
            <Icone size={22} aria-hidden />
            <span>{rotulo}</span>
          </NavLink>
        ))}
      </nav>

      <MeuPerfil aberto={perfilAberto} onFechar={() => setPerfilAberto(false)} />
    </div>
  )
}
