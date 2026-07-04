import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Activity, Monitor } from "lucide-react";
import adminApi from "./adminApi";
import StatCard from "./StatCard";
import LoadingSpinner from "../ui/LoadingSpinner";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const POLL_MS = 20000;

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);

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
    } catch {
      // keep stale data on poll failure
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, []);

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
        borderRadius: 8,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Overview</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Registered Users" value={stats?.totalUsers} accent />
        <StatCard label="Active Sessions" value={stats?.activeSessions} accent />
        <StatCard label="Active Guests" value={stats?.activeGuests} accent />
        <StatCard label="Bandwidth (MB/s)" value={stats?.bandwidthMbps} accent />
      </div>

      {/* Peak-hour chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">Peak-Hour Usage (last 24 h)</p>
        <Bar
          data={chartData}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, grid: { color: "#fce7f3" } },
            },
          }}
        />
      </div>

      {/* Live connected devices */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-gray-600">Live Connected Devices</p>
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
                <tr className="bg-pink-50 border-b border-pink-100">
                  {["User", "Student No.", "MAC Address", "IP Address", "Login Time"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-bold text-pink-700 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.session_id} className="border-b border-slate-100 hover:bg-pink-50/40">
                    <td className="px-4 py-2 text-gray-800">{d.full_name}</td>
                    <td className="px-4 py-2 text-gray-600">{d.student_number}</td>
                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{d.mac_address}</td>
                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{d.ip_address}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(d.login_time).toLocaleTimeString()}</td>
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
