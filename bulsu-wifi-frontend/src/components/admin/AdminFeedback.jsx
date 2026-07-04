import { useEffect, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PAGE_SIZE = 20;

export default function AdminFeedback() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState(null);

  const fetchFeedback = async (p = page) => {
    setLoading(true);
    try {
      const [fb, agg] = await Promise.all([
        adminApi.get("/admin/feedback", { params: { page: p, limit: PAGE_SIZE } }),
        adminApi.get("/admin/feedback/aggregate"),
      ]);
      setRows(fb.data.feedback);
      setTotal(fb.data.total);
      setAggregate(agg.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFeedback(page); }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Rating", "Comment", "Student No.", "Submitted At"];
  const tableRows = rows.map((f) => (
    <>
      <td className="px-4 py-2">
        <span className="text-yellow-500 font-bold">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
      </td>
      <td className="px-4 py-2 text-gray-700 text-sm max-w-xs truncate">{f.comment ?? "—"}</td>
      <td className="px-4 py-2 text-gray-500 text-xs font-mono">{f.student_number ?? "Anonymous"}</td>
      <td className="px-4 py-2 text-xs text-gray-400">{new Date(f.submitted_at).toLocaleString()}</td>
    </>
  ));

  const chartData = {
    labels: ["1 ★", "2 ★", "3 ★", "4 ★", "5 ★"],
    datasets: [{
      label: "Responses",
      data: aggregate ? [1, 2, 3, 4, 5].map((r) => aggregate.distribution[r] ?? 0) : [],
      backgroundColor: "#db2777",
      borderRadius: 8,
    }],
  };

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Feedback</h2>

      {aggregate && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col items-center justify-center">
            <p className="text-xs text-gray-500 mb-1">Average Rating</p>
            <p className="text-4xl font-bold text-pink-600">{aggregate.average?.toFixed(1)}</p>
            <p className="text-yellow-500 text-xl mt-1">{"★".repeat(Math.round(aggregate.average ?? 0))}</p>
            <p className="text-xs text-gray-400 mt-1">{aggregate.total} responses</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs font-semibold text-gray-600 mb-3">Rating Distribution</p>
            <Bar data={chartData} options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: "#fce7f3" }, ticks: { stepSize: 1 } },
              },
            }} />
          </div>
        </div>
      )}

      <AdminTable columns={columns} rows={tableRows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        emptyText="No feedback submitted yet."
        emptyHint="Feedback submitted by students will appear here." />
    </div>
  );
}
