import {
  type BoardCardDto,
  type BoardColumnDto,
  type BoardDto,
  type CatalogItem,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUSES,
  PIPELINE_STATUSES_REQUIRING_NOTE,
  type PipelineStatus,
} from '@axiom/contracts';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Kanban } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { useRememberedTab } from '@/shared/hooks/use-remembered-tab';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { SearchInput } from '@/shared/ui/search-input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  type BoardFilters,
  fetchPipelineState,
  pipelineKeys,
  useActivities,
  useBoard,
  useChangeStatus,
  useSectors,
} from './api';
import { CardOverlay } from './board-card';
import { BoardColumn, type DragInfo } from './board-column';
import { limitForPage } from './board-paging';
import { pipelineErrorMessage } from './errors';
import { DEFAULT_LIMIT, type PipelineSearch, pipelineSearchSchema } from './search';
import { StatusNoteDialog } from './status-note-dialog';

const EMPTY_DRAG: DragInfo = { from: null, allowed: null };
const nf = new Intl.NumberFormat('es-NI');

/** Completa las 8 columnas en el orden del pipeline aunque el backend omita alguna. */
export function normalizeColumns(board: BoardDto | undefined): BoardColumnDto[] {
  return PIPELINE_STATUSES.map(
    (status) => board?.columns.find((c) => c.status === status) ?? { status, count: 0, cards: [] },
  );
}

/** El pool sin trabajar y las descartadas quedan fuera del tablero salvo que se pidan. */
export const SIDE_STATUSES: readonly PipelineStatus[] = ['POR_CONTACTAR', 'DESCARTADO'];
const SCOPES = ['activas', 'todas'] as const;
type BoardScope = (typeof SCOPES)[number];

/** Filtros ↔ URL (`/pipeline?q=&sectorId=&activityId=&limitPerColumn=`). */
export function usePipelineSearch() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const search = useMemo(() => pipelineSearchSchema.parse(raw ?? {}), [raw]);
  const update = (patch: Partial<PipelineSearch>) =>
    navigate({
      to: '/pipeline',
      search: ((prev: Record<string, unknown>) => {
        const next = { ...pipelineSearchSchema.parse(prev), ...patch };
        return {
          q: next.q || undefined,
          sectorId: next.sectorId || undefined,
          activityId: next.activityId || undefined,
          limitPerColumn: next.limitPerColumn === DEFAULT_LIMIT ? undefined : next.limitPerColumn,
        };
      }) as never,
      replace: true,
    });
  return { search, update };
}

const catalogOption = (items: CatalogItem[] | undefined, id: number | undefined) =>
  (id !== undefined && items?.find((i) => i.id === id)) || null;

function Filters({
  search,
  update,
  total,
  scope,
  onScopeChange,
  sideCount,
}: {
  search: PipelineSearch;
  update: (p: Partial<PipelineSearch>) => void;
  /** Empresas que cumplen los filtros (suma de las columnas), o null mientras carga. */
  total: number | null;
  scope: BoardScope;
  onScopeChange: (scope: BoardScope) => void;
  /** Empresas en "Por contactar" + "Descartado" (para el interruptor). */
  sideCount: number | null;
}) {
  const sectors = useSectors();
  const activities = useActivities();
  const [text, setText] = useState(search.q ?? '');
  const debounced = useDebouncedValue(text, 300);

  // Texto → URL (debounce) y URL → texto (atrás/adelante del navegador).
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona al texto con debounce.
  useEffect(() => {
    const next = debounced.trim() || undefined;
    if (next !== search.q) update({ q: next, limitPerColumn: DEFAULT_LIMIT });
  }, [debounced]);
  useEffect(() => {
    setText(search.q ?? '');
  }, [search.q]);

  const filtered = !!(search.q || search.sectorId || search.activityId);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      <SearchInput
        aria-label="Buscar empresa"
        placeholder="Buscar por razón social, nombre comercial o RUC"
        className="min-w-64 flex-1 lg:max-w-md"
        value={text}
        maxLength={100}
        onValueChange={setText}
      />
      <SearchableSelect
        aria-label="Sector"
        className="w-full sm:w-52"
        placeholder="Todos los sectores"
        searchPlaceholder="Buscar sector…"
        options={sectors.data ?? []}
        isLoading={sectors.isPending}
        value={catalogOption(sectors.data, search.sectorId)}
        onChange={(o) => update({ sectorId: o?.id, limitPerColumn: DEFAULT_LIMIT })}
      />
      <SearchableSelect
        aria-label="Actividad"
        className="w-full sm:w-64"
        placeholder="Todas las actividades"
        searchPlaceholder="Buscar actividad…"
        options={activities.data ?? []}
        isLoading={activities.isPending}
        value={catalogOption(activities.data, search.activityId)}
        onChange={(o) => update({ activityId: o?.id, limitPerColumn: DEFAULT_LIMIT })}
      />
      {filtered && (
        <Button
          variant="ghost"
          onClick={() => {
            setText('');
            update({
              q: undefined,
              sectorId: undefined,
              activityId: undefined,
              limitPerColumn: DEFAULT_LIMIT,
            });
          }}
        >
          Limpiar
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        {total !== null && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-medium tabular-nums text-foreground">{nf.format(total)}</span>{' '}
            {scope === 'activas' ? 'en seguimiento' : total === 1 ? 'empresa' : 'empresas'}
            {filtered ? ' encontradas' : ''}
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            role="switch"
            aria-checked={scope === 'todas'}
            checked={scope === 'todas'}
            onChange={(e) => onScopeChange(e.target.checked ? 'todas' : 'activas')}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-[left] after:duration-200 peer-checked:after:left-[18px]"
          />
          Por contactar y descartadas
          {sideCount !== null && (
            <span className="rounded-md bg-muted px-1.5 py-px text-xs tabular-nums">
              {nf.format(sideCount)}
            </span>
          )}
        </label>
      </div>
    </div>
  );
}

/** Columnas fluidas: llenan el ancho disponible y, si no caben, se desplazan con imán. */
const BOARD_GRID = 'grid items-stretch gap-3 [--col-min:80vw] sm:[--col-min:11rem]';
const COLUMN_MIN = 'var(--col-min)';

function BoardSkeleton() {
  return (
    <div
      role="status"
      className={cn(BOARD_GRID, 'overflow-hidden')}
      style={{ gridTemplateColumns: `repeat(6, minmax(${COLUMN_MIN}, 1fr))` }}
      aria-busy="true"
      aria-label="Cargando tablero"
    >
      {PIPELINE_STATUSES.filter((st) => !SIDE_STATUSES.includes(st)).map((st) => (
        <div key={st} className="space-y-2 rounded-xl bg-muted/60 p-2">
          <Skeleton className="mx-1 my-1.5 h-4 w-28" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

type ColumnPages = Partial<Record<PipelineStatus, number>>;

/** Página actual de cada columna; vuelve a la primera cuando cambian la búsqueda o los filtros. */
function useColumnPages(filterKey: string) {
  const [state, setState] = useState<{ key: string; pages: ColumnPages }>({
    key: filterKey,
    pages: {},
  });
  const pages = state.key === filterKey ? state.pages : {};
  const setPage = (status: PipelineStatus, page: number) =>
    setState((prev) => ({
      key: filterKey,
      pages: { ...(prev.key === filterKey ? prev.pages : {}), [status]: page },
    }));
  return { pages, setPage };
}

export function PipelinePage() {
  const { search, update } = usePipelineSearch();
  const filters: BoardFilters = {
    q: search.q,
    sectorId: search.sectorId,
    activityId: search.activityId,
    limitPerColumn: search.limitPerColumn,
  };
  const board = useBoard(filters);
  const qc = useQueryClient();
  const change = useChangeStatus();
  const [drag, setDrag] = useState<DragInfo>(EMPTY_DRAG);
  const [dragCard, setDragCard] = useState<BoardCardDto | null>(null);
  const [version, setVersion] = useState<number | undefined>();
  const [discardDrop, setDiscardDrop] = useState<{ card: BoardCardDto; to: PipelineStatus } | null>(
    null,
  );
  const [scope, setScope] = useRememberedTab<BoardScope>('pipeline-alcance', SCOPES, 'activas');

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const allColumns = normalizeColumns(board.data);
  const columns =
    scope === 'todas' ? allColumns : allColumns.filter((c) => !SIDE_STATUSES.includes(c.status));
  const { pages, setPage } = useColumnPages(
    JSON.stringify([search.q, search.sectorId, search.activityId]),
  );
  // `limitPerColumn` subió y el tablero aún trae las tarjetas que faltan.
  const loadingMore = board.isPlaceholderData || board.isFetching;

  function changePage(column: BoardColumnDto, page: number) {
    setPage(column.status, page);
    const limit = limitForPage(page, column.count, search.limitPerColumn);
    if (limit !== null) update({ limitPerColumn: limit });
  }

  async function onDragStart(e: DragStartEvent) {
    const card = e.active.data.current?.card as BoardCardDto | undefined;
    if (!card) return;
    const from = allColumns.find((c) => c.cards.some((x) => x.id === card.id))?.status ?? null;
    setDragCard(card);
    setDrag({ from, allowed: null });
    setVersion(undefined);
    try {
      const state = await qc.fetchQuery({
        queryKey: pipelineKeys.state(card.id),
        queryFn: ({ signal }) => fetchPipelineState(card.id, signal),
        staleTime: 0,
      });
      setVersion(state.version);
      setDrag({ from: state.status, allowed: new Set(state.allowedNextStatuses) });
    } catch (err) {
      toast.error(pipelineErrorMessage(err));
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const card = dragCard;
    const allowed = drag.allowed;
    const from = drag.from;
    const expectedVersion = version;
    setDrag(EMPTY_DRAG);
    setDragCard(null);
    const to = e.over?.id as PipelineStatus | undefined;
    if (!card || !to || to === from) return;
    if (allowed && !allowed.has(to)) {
      toast.error(
        `No se puede pasar de "${PIPELINE_STATUS_LABELS[from as PipelineStatus]}" a "${PIPELINE_STATUS_LABELS[to]}".`,
      );
      return;
    }
    if (PIPELINE_STATUSES_REQUIRING_NOTE.includes(to)) {
      setDiscardDrop({ card, to });
      return;
    }
    change.mutate({ companyId: card.id, to, expectedVersion });
  }

  const hasCards = columns.some((c) => c.count > 0);
  const filtered = !!(search.q || search.sectorId || search.activityId);
  const total = board.data ? columns.reduce((sum, c) => sum + c.count, 0) : null;
  const sideCount = board.data
    ? allColumns.filter((c) => SIDE_STATUSES.includes(c.status)).reduce((s, c) => s + c.count, 0)
    : null;

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Empresas en seguimiento. Arrastra una tarjeta, o usa su menú ···, para cambiar la etapa."
      />
      <Filters
        search={search}
        update={update}
        total={total}
        scope={scope}
        onScopeChange={setScope}
        sideCount={sideCount}
      />

      {board.isPending ? (
        <BoardSkeleton />
      ) : board.isError ? (
        <EmptyState
          icon={Kanban}
          title="No se pudo cargar el tablero"
          description={pipelineErrorMessage(board.error)}
          action={<Button onClick={() => board.refetch()}>Reintentar</Button>}
        />
      ) : !hasCards ? (
        <EmptyState
          icon={Kanban}
          title={
            filtered
              ? 'Sin resultados'
              : scope === 'activas' && sideCount
                ? 'Ninguna empresa en seguimiento'
                : 'No hay empresas en el pipeline'
          }
          description={
            filtered
              ? 'Prueba con otros filtros.'
              : scope === 'activas' && sideCount
                ? 'Todas siguen en Por contactar o descartadas. Activa el interruptor para verlas.'
                : 'Importa empresas para empezar.'
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDrag(EMPTY_DRAG);
            setDragCard(null);
          }}
        >
          <div
            className="-mx-4 snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 pb-4 sm:mx-0 sm:px-0"
            data-testid="board-scroll"
          >
            <div
              className={BOARD_GRID}
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(${COLUMN_MIN}, 1fr))`,
              }}
            >
              {columns.map((column) => (
                <BoardColumn
                  key={column.status}
                  column={column}
                  drag={drag}
                  page={pages[column.status] ?? 1}
                  onPageChange={(page) => changePage(column, page)}
                  loadingMore={loadingMore}
                />
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragCard && <CardOverlay card={dragCard} />}
          </DragOverlay>
        </DndContext>
      )}

      {discardDrop && (
        <StatusNoteDialog
          open
          onOpenChange={(o) => !o && setDiscardDrop(null)}
          status={discardDrop.to}
          companyName={discardDrop.card.legalName}
          pending={change.isPending}
          onConfirm={(note) => {
            const { card, to } = discardDrop;
            setDiscardDrop(null);
            change.mutate({ companyId: card.id, to, note, expectedVersion: version });
          }}
        />
      )}
    </div>
  );
}
