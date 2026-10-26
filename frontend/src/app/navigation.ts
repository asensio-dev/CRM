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

export type NavGroup = 'Trabajo diario' | 'Seguimiento' | 'Administración';

export const NAV_GROUPS: readonly NavGroup[] = ['Trabajo diario', 'Seguimiento', 'Administración'];

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
  group: NavGroup;
  /** Si se omite, visible para todos los roles. */
  roles?: readonly UserRole[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/mi-semana', label: 'Mi semana', icon: CalendarCheck, group: 'Trabajo diario' },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare, group: 'Trabajo diario' },
  { to: '/empresas', label: 'Empresas', icon: Building2, group: 'Trabajo diario' },
  { to: '/cartera', label: 'Cartera', icon: Briefcase, group: 'Trabajo diario' },
  { to: '/citas', label: 'Citas', icon: CalendarDays, group: 'Seguimiento' },
  { to: '/contratos', label: 'Contratos', icon: FileSignature, group: 'Seguimiento' },
  { to: '/tablero', label: 'Tablero', icon: LayoutDashboard, group: 'Seguimiento' },
  {
    to: '/importacion',
    label: 'Importación',
    icon: Upload,
    group: 'Administración',
    roles: ['ADMIN'],
  },
  { to: '/usuarios', label: 'Usuarios', icon: Users, group: 'Administración', roles: ['ADMIN'] },
];

export function navForRole(role: UserRole | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.roles || (role !== undefined && i.roles.includes(role)));
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EJECUTIVO: 'Ejecutivo',
};
