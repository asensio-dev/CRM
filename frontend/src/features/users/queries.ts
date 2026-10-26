import type { CreateUser, Paginated, ResetPassword, UpdateUser, UserDto } from '@axiom/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { DEFAULT_PAGE_SIZE } from '@/shared/ui/pagination';

export const USERS_PAGE_SIZE = DEFAULT_PAGE_SIZE;
/** Máximo que admite el API por página; se usa para traer el directorio completo. */
const FETCH_PAGE_SIZE = 100;

export const userKeys = {
  all: ['users'] as const,
  list: () => [...userKeys.all, 'list'] as const,
};

/**
 * Directorio completo de usuarios. `GET /users` solo pagina (sin `q` ni filtros), así que se
 * traen todas las páginas de 100 y la búsqueda, los filtros y la paginación se hacen en cliente.
 * El número de cuentas es pequeño (decenas), por lo que suele ser una sola petición.
 */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async ({ signal }) => {
      const items: UserDto[] = [];
      for (let page = 1; ; page++) {
        const res = await api.get<Paginated<UserDto>>(
          `/users?page=${page}&pageSize=${FETCH_PAGE_SIZE}`,
          signal,
        );
        items.push(...res.items);
        if (res.items.length === 0 || items.length >= res.total) return items;
      }
    },
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUser) => api.post<UserDto>('/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateUser) => api.patch<UserDto>(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useResetPassword(id: number) {
  return useMutation({
    mutationFn: (body: ResetPassword) => api.post<void>(`/users/${id}/reset-password`, body),
  });
}
