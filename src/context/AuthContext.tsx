import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "admin" | "user";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
}

const USERS: Array<AuthUser & { password: string }> = [
  {
    id: "1",
    name: "Government Official",
    email: "admin@gov.et",
    password: "admin123",
    role: "admin",
    organizationId: null,
    organizationName: null,
  },
  {
    id: "2",
    name: "Borsi School",
    email: "borsi@school.et",
    password: "borsi123",
    role: "user",
    organizationId: "borsi_school",
    organizationName: "Borsi School",
  },
  {
    id: "3",
    name: "Adama Hospital",
    email: "adama@hospital.et",
    password: "adama123",
    role: "user",
    organizationId: "adama_hospital",
    organizationName: "Adama Hospital",
  },
  {
    id: "4",
    name: "Jimma University",
    email: "jimma@edu.et",
    password: "jimma123",
    role: "user",
    organizationId: "jimma_university",
    organizationName: "Jimma University",
  },
];

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("auth_user");
    return stored ? JSON.parse(stored) : null;
  });

  const login = async (email: string, password: string) => {
    const found = USERS.find(
      (u) => u.email === email && u.password === password
    );
    if (!found) {
      return { success: false, error: "Invalid email or password" };
    }
    const { password: _, ...authUser } = found;
    setUser(authUser);
    localStorage.setItem("auth_user", JSON.stringify(authUser));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("auth_user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useOrgFilter() {
  const { user, isAdmin } = useAuth();
  return isAdmin ? null : user?.organizationId ?? null;
}