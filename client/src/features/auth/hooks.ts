import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { AuthData } from '@wedding-suite/shared/auth';
import { currentUser } from './api.js';

export const sessionKey = ['auth', 'me'] as const;
export function useSession() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => currentUser(signal),
    retry: false,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const identity = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (query.data === undefined) return;
    const next = query.data?.user.id ?? null;
    if (identity.current !== next) {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      identity.current = next;
    }
  }, [query.data, client]);
  return query;
}
export async function updateSession(
  client: QueryClient,
  data: AuthData | null,
) {
  await client.cancelQueries();
  client.clear();
  client.setQueryData(sessionKey, data);
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('wedding-suite-auth');
    channel.postMessage('changed');
    channel.close();
  }
}
