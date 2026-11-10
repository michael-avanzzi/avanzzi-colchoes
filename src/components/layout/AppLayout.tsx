import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '../../auth/AuthProvider'
import { PAPEL_ROTULO, type Papel } from '../../types/auth'
import { Logo } from './Logo'

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
  const { perfil, signOut } = useAuth()
  if (!perfil?.allowed) return null

  const itens = MENU.filter((item) => !item.papeis || item.papeis.includes(perfil.papel))

  return (
    <div className="app">
      <aside className="barra-lateral" aria-label="Menu principal">
        <Logo />
        <nav className="menu">
          {itens.map(({ to, rotulo, icone: Icone }) => (
            <NavLink key={to} to={to} end={to === '/'} className="menu-item">
              <Icone size={20} aria-hidden />
              <span>{rotulo}</span>
            </NavLink>
          ))}
        </nav>

        <div className="usuario">
          <div className="usuario-avatar" aria-hidden>
            {perfil.nome.trim().charAt(0).toUpperCase()}
          </div>
          <div className="usuario-dados">
            <strong>{perfil.nome}</strong>
            <span>{PAPEL_ROTULO[perfil.papel]}</span>
          </div>
          <button
            type="button"
            className="botao-icone"
            onClick={() => void signOut()}
            title="Sair"
            aria-label="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
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
    </div>
  )
}
