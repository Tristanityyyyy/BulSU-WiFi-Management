import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Activity, Monitor, Users, Radio, KeyRound, Gauge, BarChart3, RefreshCw } from "lucide-react";
import adminApi from "./adminApi";
import StatCard from "./StatCard";
import LoadingSpinner from "../ui/LoadingSpinner";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const POLL_MS = 20000;

const formatDuration = (loginTime) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(loginTime).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = async () => {
    try {
      const [s, d, c] = await Promise.all([
        adminApi.get("/admin/overview/stats"),
        adminApi.get("/admin/overview/connected"),
        adminApi.get("/admin/overview/peak-hours"),
      ]);
      setStats(s.data);
      setDevices(d.data);
      setChart(c.data);
      setLastUpdated(new Date());
    } catch {
      // keep stale data on poll failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size={40} className="text-pink-400" />
      </div>
    );
  }

  const chartData = {
    labels: chart?.labels ?? [],
    datasets: [
      {
        label: "Sessions",
        data: chart?.data ?? [],
        backgroundColor: "#db2777",
        hoverBackgroundColor: "#be185d",
        borderRadius: 8,
        maxBarThickness: 36,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">Real-time snapshot of network activity</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 bg-white border border-pink-200 text-pink-700 text-xs font-semibold px-3 py-2 rounded-xl shadow hover:bg-pink-50 transition disabled:opacity-60"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Registered Users" value={stats?.totalUsers} icon={Users} tone="pink" />
        <StatCard label="Active Sessions" value={stats?.activeSessions} icon={Radio} tone="blue" />
        <StatCard label="Active Guests" value={stats?.activeGuests} icon={KeyRound} tone="green" />
        <StatCard label="Bandwidth (MB/s)" value={stats?.bandwidthMbps} icon={Gauge} tone="amber" />
      </div>

      {/* Peak-hour chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={15} className="text-pink-500" />
            <p className="text-xs font-semibold text-gray-600">Peak-Hour Usage</p>
          </div>
          <span className="text-xs text-slate-400">Last 24 hours</span>
        </div>
        {(chart?.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <BarChart3 size={32} strokeWidth={1.5} className="text-slate-300" />
            <p className="text-sm text-slate-500">No session activity yet.</p>
            <p className="text-xs text-slate-400">Usage will chart here once devices connect.</p>
          </div>
        ) : (
          <Bar
            data={chartData}
            options={{
              responsive: true,
              plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8 },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#f1f5f9" } },
              },
            }}
          />
        )}
      </div>

      {/* Live connected devices */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-600">Live Connected Devices</p>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              {devices.length}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <Activity size={11} className="text-green-600" />
            Live
          </span>
        </div>
        {devices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <Monitor size={32} strokeWidth={1.5} className="text-slate-300" />
            <p className="text-sm text-slate-500">No devices currently connected.</p>
            <p className="text-xs text-slate-400">Connected devices will appear here in real time.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200">
                  {["User", "Student No.", "MAC Address", "IP Address", "Login Time", "Duration"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.session_id} className="border-b border-slate-100 hover:bg-pink-50/40 transition-colors">
                    <td className="px-4 py-2 text-gray-800">{d.full_name}</td>
                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{d.student_number}</td>
                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{d.mac_address}</td>
                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{d.ip_address}</td>
                    <td className="px-4 py-2 font-mono text-gray-500 text-xs">{new Date(d.login_time).toLocaleTimeString()}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        {formatDuration(d.login_time)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
