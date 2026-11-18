import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchMe, logout as apiLogout } from "./api.js";

interface AuthState {
  /** undefined while we don't know yet, null when logged out. */
  user: string | null | undefined;
  setUser(email: string | null): void;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((email) => !cancelled && setUser(email));
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth must be used inside <AuthProvider>.");
  return state;
}
