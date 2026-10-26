import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { prefetchPages } from '../page-loaders';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppLayout() {
  // Con la sesión ya abierta, precarga el resto de pantallas cuando el navegador esté libre.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));
    idle(() => prefetchPages());
  }, []);
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* `relative`: contiene los elementos `absolute` (p. ej. tablas sr-only de los gráficos);
            sin él estiran el documento y aparece una segunda barra de scroll en la ventana. */}
        <main className="bg-workspace relative flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[90rem]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
