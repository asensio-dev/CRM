import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* `relative`: contiene los elementos `absolute` (p. ej. tablas sr-only de los gráficos);
            sin él estiran el documento y aparece una segunda barra de scroll en la ventana. */}
        <main className="relative flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
