import {
  type BoardCardDto,
  type BoardColumnDto,
  type BoardDto,
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
import { Kanban, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
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
import { pipelineErrorMessage } from './errors';
import { LIMIT_STEP, MAX_LIMIT, type PipelineSearch, pipelineSearchSchema } from './search';
import { StatusNoteDialog } from './status-note-dialog';

const EMPTY_DRAG: DragInfo = { from: null, allowed: null };

/** Completa las 8 columnas en el orden del pipeline aunque el backend omita alguna. */
export function normalizeColumns(board: BoardDto | undefined): BoardColumnDto[] {
  return PIPELINE_STATUSES.map(
    (status) => board?.columns.find((c) => c.status === status) ?? { status, count: 0, cards: [] },
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

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
          limitPerColumn: next.limitPerColumn === 20 ? undefined : next.limitPerColumn,
        };
      }) as never,
      replace: true,
    });
  return { search, update };
}

function Filters({
  search,
  update,
}: {
  search: PipelineSearch;
  update: (p: Partial<PipelineSearch>) => void;
}) {
  const sectors = useSectors();
  const activities = useActivities();
  const [text, setText] = useState(search.q ?? '');
  const debounced = useDebounced(text, 300);

  // Texto → URL (debounce) y URL → texto (atrás/adelante del navegador).
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona al texto con debounce.
  useEffect(() => {
    const next = debounced.trim() || undefined;
    if (next !== search.q) update({ q: next, limitPerColumn: 20 });
  }, [debounced]);
  useEffect(() => {
    setText(search.q ?? '');
  }, [search.q]);

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_18rem_auto]">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Buscar empresa"
          placeholder="Razón social, nombre comercial o RUC"
          className="pl-9"
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <NativeSelect
        aria-label="Sector"
        value={search.sectorId ?? ''}
        onChange={(e) =>
          update({
            sectorId: e.target.value ? Number(e.target.value) : undefined,
            limitPerColumn: 20,
          })
        }
      >
        <option value="">Todos los sectores</option>
        {sectors.data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Actividad"
        value={search.activityId ?? ''}
        onChange={(e) =>
          update({
            activityId: e.target.value ? Number(e.target.value) : undefined,
            limitPerColumn: 20,
          })
        }
      >
        <option value="">Todas las actividades</option>
        {activities.data?.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
      {(search.q || search.sectorId || search.activityId) && (
        <Button
          variant="ghost"
          onClick={() =>
            update({ q: undefined, sectorId: undefined, activityId: undefined, limitPerColumn: 20 })
          }
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div
      role="status"
      className="flex gap-3 overflow-hidden"
      aria-busy="true"
      aria-label="Cargando tablero"
    >
      {PIPELINE_STATUSES.slice(0, 5).map((s) => (
        <div key={s} className="w-72 shrink-0 space-y-2 rounded-lg border bg-muted/40 p-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ))}
    </div>
  );
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
  const [discardedOpen, setDiscardedOpen] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const columns = normalizeColumns(board.data);

  async function onDragStart(e: DragStartEvent) {
    const card = e.active.data.current?.card as BoardCardDto | undefined;
    if (!card) return;
    const from = columns.find((c) => c.cards.some((x) => x.id === card.id))?.status ?? null;
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

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Arrastra las empresas entre columnas para cambiar su estado."
      />
      <Filters search={search} update={update} />

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
          title={filtered ? 'Sin resultados' : 'No hay empresas en el pipeline'}
          description={filtered ? 'Prueba con otros filtros.' : 'Importa empresas para empezar.'}
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
            className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
            data-testid="board-scroll"
          >
            <div className="flex w-max items-start gap-3">
              {columns.map((column) => (
                <BoardColumn
                  key={column.status}
                  column={column}
                  drag={drag}
                  collapsible={column.status === 'DESCARTADO'}
                  collapsed={column.status === 'DESCARTADO' && !discardedOpen}
                  onToggleCollapsed={() => setDiscardedOpen((v) => !v)}
                  canLoadMore={
                    column.cards.length < column.count && search.limitPerColumn < MAX_LIMIT
                  }
                  onLoadMore={() =>
                    update({
                      limitPerColumn: Math.min(MAX_LIMIT, search.limitPerColumn + LIMIT_STEP),
                    })
                  }
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
