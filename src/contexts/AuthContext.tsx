import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";

export interface AuthUser {
  id:               string;
  name:             string;
  email:            string;
  role:             UserRole;
  /** null for admin — they see everything */
  organizationId:   string | null;
  organizationName: string | null;
}

interface AuthContextType {
  user:    AuthUser | null;
  isAdmin: boolean;
  login:   (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout:  () => void;
}

// ─── Hardcoded user directory ─────────────────────────────────────────────────
// In production this would be replaced by a real API call.

const HARDCODED_USERS: Array<AuthUser & { password: string }> = [
  // ── Government Admins (see ALL facilities) ──────────────────────────────────
  {
    id:               "admin-1",
    name:             "Government Official",
    email:            "admin@cgdisaster.gov.in",
    password:         "Admin@123",
    role:             "admin",
    organizationId:   null,
    organizationName: null,
  },
  {
    id:               "admin-2",
    name:             "District Collector",
    email:            "collector@durg.gov.in",
    password:         "Collector@123",
    role:             "admin",
    organizationId:   null,
    organizationName: null,
  },

  // ── School Users (see only their own school) ────────────────────────────────
  {
    id:               "school-borsi-1",
    name:             "Borsi School Admin",
    email:            "borsi.school@durg.edu",
    password:         "School@123",
    role:             "user",
    // "borsi" is the name key used to filter facilities whose name contains "borsi"
    organizationId:   "borsi_school",
    organizationName: "Govt Primary School Borsi",
  },
  {
    id:               "school-borsi-hs-1",
    name:             "Borsi Higher Secondary Admin",
    email:            "borsi.hs@durg.edu",
    password:         "BorsiHS@123",
    role:             "user",
    organizationId:   "borsi_school",
    organizationName: "Govt Higher Secondary School Borsi",
  },

  // ── Hospital Users (see only their own hospital) ────────────────────────────
  {
    id:               "hospital-jln-1",
    name:             "JLN Hospital Admin",
    email:            "jln.hospital@durg.health",
    password:         "Hospital@123",
    role:             "user",
    // "jln" must appear in the facility name in mockFacilities
    organizationId:   "jln_hospital",
    organizationName: "JLN Hospital",
  },
  {
    id:               "hospital-ccm-1",
    name:             "CCM Hospital Admin",
    email:            "ccm.hospital@durg.health",
    password:         "CCMH@123",
    role:             "user",
    organizationId:   "ccm_hospital",
    organizationName: "CCM Govt. Medical College & Hospital",
  },
  {
    id:               "hospital-sai-1",
    name:             "Shri Sai Hospital Admin",
    email:            "sai.hospital@durg.health",
    password:         "Sai@123",
    role:             "user",
    organizationId:   "sai_hospital",
    organizationName: "Shri Sai Hospital",
  },
];

const LS_KEY = "cg_risk_auth_user_v1";

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      const match = HARDCODED_USERS.find(
        (u) =>
          u.email.toLowerCase() === email.trim().toLowerCase() &&
          u.password === password,
      );
      if (!match) {
        return { ok: false, error: "Invalid email or password." };
      }
      const { password: _pw, ...safeUser } = match;
      setUser(safeUser);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(safeUser));
      } catch { /* quota */ }
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(LS_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAdmin: user?.role === "admin", login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}