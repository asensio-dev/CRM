import type {
  CycleCoverageDto,
  ExecutivesDto,
  FunnelDto,
  SummaryDto,
  WeeklyActivityDto,
} from '@axiom/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { type AnalyticsFilterValues, filterQueryString } from './search';

/** Claves de caché de analytics. Las mutaciones de citas/contratos invalidan `analyticsKeys.all`. */
export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: (f: AnalyticsFilterValues) => ['analytics', 'summary', f] as const,
  funnel: (f: AnalyticsFilterValues) => ['analytics', 'funnel', f] as const,
  weekly: (f: AnalyticsFilterValues, byExecutive: boolean) =>
    ['analytics', 'weekly', f, byExecutive] as const,
  executives: (f: AnalyticsFilterValues) => ['analytics', 'executives', f] as const,
  coverage: (f: AnalyticsFilterValues) => ['analytics', 'coverage', f] as const,
};

const STALE = 30_000;

export function useSummary(f: AnalyticsFilterValues) {
  return useQuery({
    queryKey: analyticsKeys.summary(f),
    queryFn: ({ signal }) =>
      api.get<SummaryDto>(`/analytics/summary?${filterQueryString(f)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useFunnel(f: AnalyticsFilterValues) {
  return useQuery({
    queryKey: analyticsKeys.funnel(f),
    queryFn: ({ signal }) =>
      api.get<FunnelDto>(`/analytics/funnel?${filterQueryString(f)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

/** Siempre 12 semanas que terminan en la semana de `to`; `from` no recorta (se quiere contexto). */
export function useWeeklyActivity(f: AnalyticsFilterValues, byExecutive: boolean) {
  const { from: _from, ...rest } = f;
  return useQuery({
    queryKey: analyticsKeys.weekly(rest, byExecutive),
    queryFn: ({ signal }) =>
      api.get<WeeklyActivityDto>(
        `/analytics/weekly-activity?${filterQueryString(rest, {
          weeks: '12',
          ...(byExecutive ? { byExecutive: 'true' } : {}),
        })}`,
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useExecutives(f: AnalyticsFilterValues, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.executives(f),
    queryFn: ({ signal }) =>
      api.get<ExecutivesDto>(`/analytics/executives?${filterQueryString(f)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled,
  });
}

export function useCycleCoverage(f: AnalyticsFilterValues) {
  return useQuery({
    queryKey: analyticsKeys.coverage(f),
    queryFn: ({ signal }) =>
      api.get<CycleCoverageDto>(`/analytics/cycle-coverage?${filterQueryString(f)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}
