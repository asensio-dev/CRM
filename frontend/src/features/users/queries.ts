import type { CreateUser, Paginated, ResetPassword, UpdateUser, UserDto } from '@axiom/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const USERS_PAGE_SIZE = 20;

export const userKeys = {
  all: ['users'] as const,
  list: (page: number) => [...userKeys.all, 'list', page] as const,
};

export function useUsers(page: number) {
  return useQuery({
    queryKey: userKeys.list(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<UserDto>>(`/users?page=${page}&pageSize=${USERS_PAGE_SIZE}`, signal),
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
