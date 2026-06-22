import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/contexts/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* ── Fixed top header ── */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 shadow-sm z-50 flex items-center px-6 gap-6">

        {/* LEFT: Logo + Partner names — grouped together */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <img
            src="/logo.jpeg"
            alt="CrisisLens"
            className="h-11 w-auto rounded-md object-contain"
          />
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex items-center gap-2.5 text-xs font-semibold text-gray-700 tracking-wide">
            <span>NIT Raipur</span>
            <span className="text-gray-300 font-light">|</span>
            <span>Government of Chhattisgarh</span>
            <span className="text-gray-300 font-light">|</span>
            <span>UNICEF</span>
          </div>
        </div>

        {/* SPACER */}
        <div className="flex-1" />

        {/* RIGHT: User info + logout */}
        {user && (
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</div>
              <div className="text-[11px] text-gray-400 leading-tight">
                {user.role === "admin"
                  ? "Government Admin"
                  : user.organizationName ?? "Facility User"}
              </div>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <button
              onClick={logout}
              className="text-xs font-semibold bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              Log out
            </button>
          </div>
        )}
      </header>

      {/* ── Body below header ── */}
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <div className="flex-1 ml-64 px-8 py-8 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}