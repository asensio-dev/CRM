import type { UserRole } from '@axiom/contracts';
import {
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  FileSignature,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Upload,
  Users,
} from 'lucide-react';

export interface NavItem {
  to:
    | '/mi-semana'
    | '/pipeline'
    | '/empresas'
    | '/cartera'
    | '/citas'
    | '/contratos'
    | '/tablero'
    | '/importacion'
    | '/usuarios';
  label: string;
  icon: LucideIcon;
  /** Si se omite, visible para todos los roles. */
  roles?: readonly UserRole[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/mi-semana', label: 'Mi semana', icon: CalendarCheck },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/empresas', label: 'Empresas', icon: Building2 },
  { to: '/cartera', label: 'Cartera', icon: Briefcase },
  { to: '/citas', label: 'Citas', icon: CalendarDays },
  { to: '/contratos', label: 'Contratos', icon: FileSignature },
  { to: '/tablero', label: 'Tablero', icon: LayoutDashboard },
  { to: '/importacion', label: 'Importación', icon: Upload, roles: ['ADMIN'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
];

export function navForRole(role: UserRole | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.roles || (role !== undefined && i.roles.includes(role)));
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EJECUTIVO: 'Ejecutivo',
};
