import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Radio, KeyRound,
  Siren, MessageSquare, Bell, Settings, LogOut,
} from "lucide-react";

// Grouped by what campus IT actually does with each screen.
const NAV_GROUPS = [
  {
    label: "Monitor",
    items: [
      { to: "/admin/overview", label: "Overview", Icon: LayoutDashboard },
      { to: "/admin/sessions", label: "Sessions", Icon: Radio },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/admin/users", label: "Users", Icon: Users },
      { to: "/admin/guests", label: "Guest Access", Icon: KeyRound },
    ],
  },
  {
    label: "Respond",
    items: [
      { to: "/admin/emergency", label: "Emergency", Icon: Siren },
      { to: "/admin/notifications", label: "Notifications", Icon: Bell },
      { to: "/admin/feedback", label: "Feedback", Icon: MessageSquare },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/settings", label: "Settings", Icon: Settings },
    ],
  },
];

const FLAT_NAV = NAV_GROUPS.flatMap((g) => g.items);

// Concentric broadcast arcs — the portal's ripple, echoed as a still watermark.
function ArcWatermark() {
  return (
    <svg
      viewBox="0 0 224 120"
      className="absolute bottom-0 left-0 w-full text-pink-400/[0.07] pointer-events-none"
      aria-hidden="true"
    >
      {[36, 64, 92, 120].map((r) => (
        <circle key={r} cx="0" cy="120" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen flex bg-blush-50">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-wine-950 border-r border-wine-800 p-4 shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="mb-6 px-2 flex items-center gap-3">
          <img src="/bulsu-logo.png" alt="BulSU" className="w-10 h-10 object-contain" />
          <div>
            <p className="text-white font-display font-semibold text-sm leading-tight">BulSU Wi-Fi</p>
            <p className="text-pink-300/60 text-[10px] font-semibold uppercase tracking-[0.14em]">Admin Console</p>
          </div>
        </div>

        <nav className="flex flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-pink-500/15 text-pink-200"
                          : "text-pink-100/50 hover:bg-white/5 hover:text-pink-50"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-pink-400" />
                        )}
                        <Icon size={16} strokeWidth={2} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto relative">
          <ArcWatermark />
          <button
            onClick={handleLogout}
            className="relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-pink-100/50 hover:bg-white/5 hover:text-pink-50 transition-all"
          >
            <LogOut size={16} strokeWidth={2} /> Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (mobile) */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-wine-950 border-b border-wine-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/bulsu-logo.png" alt="BulSU" className="w-7 h-7 object-contain" />
            <span className="text-white font-display font-semibold text-sm">Admin</span>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {FLAT_NAV.map(({ to, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `p-2 rounded-xl transition-all ${
                    isActive ? "bg-pink-500/15 text-pink-300" : "text-pink-100/50 hover:bg-white/5 hover:text-pink-50"
                  }`
                }
              >
                <Icon size={18} strokeWidth={2} />
              </NavLink>
            ))}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
