import type { ReactElement } from 'react';
import {
  BoardSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
  TableCardSkeleton,
  TabsSkeleton,
  TilesSkeleton,
  ToolbarSkeleton,
} from '@/shared/ui/page-skeletons';

/**
 * Esqueleto de cada pantalla mientras llega su código (o la sesión). Debe tener la misma forma
 * que el esqueleto que la propia pantalla muestra al cargar datos, para que no haya saltos.
 */
const FALLBACKS: Record<string, () => ReactElement> = {
  '/pipeline': () => (
    <>
      <PageHeaderSkeleton />
      <ToolbarSkeleton className="mb-5" />
      <BoardSkeleton />
    </>
  ),
  '/cartera': () => (
    <>
      <PageHeaderSkeleton action />
      <TabsSkeleton count={3} className="mb-6" />
      <div className="grid gap-4">
        <TilesSkeleton />
        <PanelSkeleton className="h-32" />
      </div>
    </>
  ),
  '/tablero': () => (
    <>
      <PageHeaderSkeleton />
      <ToolbarSkeleton className="mb-6" />
      <TabsSkeleton count={4} className="mb-6" />
      <div className="grid gap-4">
        <TilesSkeleton />
        <TilesSkeleton count={3} />
      </div>
    </>
  ),
  '/empresas': () => (
    <>
      <PageHeaderSkeleton action />
      <TableCardSkeleton columns={6} />
    </>
  ),
  '/contratos': () => (
    <>
      <PageHeaderSkeleton action />
      <TableCardSkeleton />
    </>
  ),
  '/usuarios': () => (
    <>
      <PageHeaderSkeleton action />
      <TableCardSkeleton />
    </>
  ),
  '/citas': () => (
    <>
      <PageHeaderSkeleton action />
      <ToolbarSkeleton className="mb-5" />
      <PanelSkeleton className="h-72" />
    </>
  ),
  '/mi-semana': () => (
    <>
      <PageHeaderSkeleton />
      <div className="grid gap-4">
        <PanelSkeleton className="h-40" />
        <TableCardSkeleton columns={3} />
      </div>
    </>
  ),
  '/importacion': () => (
    <>
      <PageHeaderSkeleton />
      <PanelSkeleton className="h-56" />
    </>
  ),
};

function DetailFallback() {
  return (
    <>
      <PageHeaderSkeleton action />
      <div className="grid gap-4 lg:grid-cols-3">
        <PanelSkeleton className="h-64 lg:col-span-2" />
        <PanelSkeleton className="h-48" />
      </div>
    </>
  );
}

/** Esqueleto para una ruta concreta (las fichas `/empresas/123` usan el de detalle). */
export function PageFallback({ path }: { path: string }) {
  if (/^\/empresas\/\d+/.test(path)) return <DetailFallback />;
  const Fallback = FALLBACKS[path];
  return Fallback ? <Fallback /> : <DetailFallback />;
}
