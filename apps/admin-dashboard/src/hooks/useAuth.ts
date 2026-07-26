import { useCallback, useState } from 'react';
import { API_BASE, type AuthRole, buildAuthHeaders } from '../lib/api';

export function useAuth() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authRole, setAuthRole] = useState<AuthRole>('unauthenticated');
  const [authEmail, setAuthEmail] = useState('admin@fidusgate.internal');
  const [authLoading, setAuthLoading] = useState(false);

  const getHeaders = useCallback(() => buildAuthHeaders(authToken), [authToken]);

  const login = useCallback(
    async (role: Exclude<AuthRole, 'unauthenticated'>, email: string, bootstrapKey: string) => {
      setAuthLoading(true);
      try {
        const res = await fetch(`${API_BASE}/auth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-fidusgate-bootstrap-key': bootstrapKey,
          },
          body: JSON.stringify({ role, email }),
        });
        if (!res.ok) {
          throw new Error('Token mint failed');
        }
        const data = (await res.json()) as { token: string; role: AuthRole; email: string };
        setAuthToken(data.token);
        setAuthRole(data.role);
        setAuthEmail(data.email);
        return data;
      } finally {
        setAuthLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setAuthRole('unauthenticated');
  }, []);

  return {
    authToken,
    authRole,
    authEmail,
    authLoading,
    setAuthEmail,
    setAuthRole,
    getHeaders,
    login,
    logout,
  };
}
