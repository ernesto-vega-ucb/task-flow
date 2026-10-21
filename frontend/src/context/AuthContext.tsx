import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Contexto placeholder para futura autenticación.
 *
 * Cuando se integre login (JWT, OAuth2, etc.), este contexto gestionará:
 * - token (string | null)
 * - usuario autenticado
 * - login() / logout()
 * El cliente HTTP (taskApi.ts) ya tiene un interceptor listo para inyectar el token.
 */
interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'taskflow.authToken';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );

  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
    if (newToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  };

  const logout = () => setToken(null);

  useEffect(() => {
    // Sincronizar entre pestañas (opcional, prepara multi-tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        setTokenState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: token !== null, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
