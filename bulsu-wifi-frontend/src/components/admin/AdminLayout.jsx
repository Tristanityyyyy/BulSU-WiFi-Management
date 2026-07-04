import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Radio, KeyRound,
  Siren, MessageSquare, Bell, Settings, LogOut,
} from "lucide-react";

const NAV = [
  { to: "/admin/overview",      label: "Overview",      Icon: LayoutDashboard },
  { to: "/admin/users",         label: "Users",         Icon: Users },
  { to: "/admin/sessions",      label: "Sessions",      Icon: Radio },
  { to: "/admin/guests",        label: "Guest Access",  Icon: KeyRound },
  { to: "/admin/emergency",     label: "Emergency",     Icon: Siren },
  { to: "/admin/feedback",      label: "Feedback",      Icon: MessageSquare },
  { to: "/admin/notifications", label: "Notifications", Icon: Bell },
  { to: "/admin/settings",      label: "Settings",      Icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-slate-950 border-r border-slate-800 p-4 gap-1 shrink-0">
        <div className="mb-6 px-2">
          <img src="/bulsu-logo.png" alt="BulSU" className="w-10 h-10 object-contain mb-2" />
          <p className="text-white font-semibold text-sm">BulSU Wi-Fi</p>
          <p className="text-slate-400 text-xs">Admin Dashboard</p>
        </div>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-pink-500/15 text-pink-300"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-all"
        >
          <LogOut size={16} strokeWidth={2} /> Logout
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (mobile) */}
        <header className="md:hidden flex items-center justify-between bg-slate-950 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/bulsu-logo.png" alt="BulSU" className="w-7 h-7 object-contain" />
            <span className="text-white font-semibold text-sm">Admin</span>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {NAV.map(({ to, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `p-2 rounded-xl transition-all ${
                    isActive ? "bg-pink-500/15 text-pink-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`
                }
              >
                <Icon size={18} strokeWidth={2} />
              </NavLink>
            ))}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
