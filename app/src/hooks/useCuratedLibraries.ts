import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CuratedLibrary } from '@gridfinity/shared';
import { apiFetch } from '../api/apiClient';

export function useCuratedLibraries() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['curated-libraries'], queryFn: () => apiFetch<{ data: CuratedLibrary[] }>('/curated-libraries') });
  const save = useMutation({
    mutationFn: ({ library, existing }: { library: CuratedLibrary; existing: boolean }) => apiFetch<{ data: CuratedLibrary }>(
      `/curated-libraries${existing ? `/${encodeURIComponent(library.id)}` : ''}`,
      { method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(library) },
    ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['curated-libraries'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/curated-libraries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['curated-libraries'] }),
  });
  return { libraries: query.data?.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch, save, remove };
}
