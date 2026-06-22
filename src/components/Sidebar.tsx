import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Map as MapIcon,
  TrendingUp,
  BarChart2,
  Database,
  Terminal,
  History,
  ClipboardList,
  PlusCircle,
  LineChart,
  LogOut,
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();
  const { user, isAdmin, logout } = useAuth();

  const allLinks = [
    { href: "/",                     label: "Dashboard",            icon: LayoutDashboard, adminOnly: false },
    { href: "/live-map",             label: "Live Map",             icon: MapIcon,         adminOnly: false },
    { href: "/predictions",          label: "Predictions",          icon: TrendingUp,      adminOnly: false },
    { href: "/forecast",             label: "ML Forecast",          icon: LineChart,       adminOnly: false },
    { href: "/accuracy-backtest",    label: "Accuracy Backtest",    icon: BarChart2,       adminOnly: true  },
    { href: "/school-risk-form",     label: "Risk Prediction Form", icon: ClipboardList,   adminOnly: false },
    { href: "/register",             label: "Register Facility",    icon: PlusCircle,      adminOnly: true  },
    { href: "/facilities-db",        label: "Facilities DB",        icon: Database,        adminOnly: false },
    { href: "/api-docs",             label: "API Docs",             icon: Terminal,        adminOnly: true  },
    { href: "/historical-analytics", label: "Historical Insights",  icon: History,         adminOnly: false },
  ];

  // Non-admins only see links where adminOnly is false
  const links = allLinks.filter((l) => !l.adminOnly || isAdmin);

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border h-screen flex flex-col fixed left-0 top-16">
      {/* User identity */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="text-xs font-bold text-orange-400 tracking-wider">DISASTER RISK ENGINE</div>
        {user && (
          <div className="mt-1.5 text-[11px] text-sidebar-foreground opacity-60 truncate">
            {user.role === "admin"
              ? "🏛 Government Admin"
              : `🏫 ${user.organizationName ?? "Facility User"}`}
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-3">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <link.icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? "text-white" : "text-sidebar-foreground opacity-70"
                }`}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: status + logout */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div>
          <div className="text-xs font-semibold text-sidebar-foreground opacity-50 mb-1">
            SYSTEM STATUS
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-sidebar-foreground opacity-70">
              Live Weather · Model Active
            </span>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  );
}