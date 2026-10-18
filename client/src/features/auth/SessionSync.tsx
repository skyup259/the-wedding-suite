import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sessionKey } from './hooks.js';

export function SessionSync() {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('wedding-suite-auth');
    channel.onmessage = () => {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      void client.resetQueries({ queryKey: sessionKey });
    };
    return () => channel.close();
  }, [client]);
  return null;
}
