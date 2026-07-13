import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { Star, MessageSquareHeart, Users2, TrendingUp, Trash2, RotateCcw } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";
import ConfirmDialog from "./ConfirmDialog";
import useSelectableSet from "./useSelectableSet";
import { useTheme } from "../../theme";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const PAGE_SIZE = 20;
const ROLE_LABELS = { student: "Student", faculty: "Faculty", staff: "Staff", guest: "Guest", unknown: "Unknown" };
const VIEWS = [
  { key: "active", label: "Active" },
  { key: "trash", label: "Trash" },
];

function Stars({ value, size = 14 }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          strokeWidth={1.5}
          className={s <= value ? "text-yellow-400 fill-yellow-400" : "text-gray-200 dark:text-wine-800"}
        />
      ))}
    </span>
  );
}

export default function AdminFeedback() {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [view, setView] = useState("active");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState(null);
  const [ratingFilter, setRatingFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const activeSelection = useSelectableSet();

  const [trashRows, setTrashRows] = useState([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashPage, setTrashPage] = useState(1);
  const [trashLoading, setTrashLoading] = useState(true);
  const trashSelection = useSelectableSet();

  const [confirm, setConfirm] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const fetchFeedback = async (p = page) => {
    setLoading(true);
    try {
      const [fb, agg] = await Promise.all([
        adminApi.get("/admin/feedback", {
          params: {
            page: p,
            limit: PAGE_SIZE,
            rating: ratingFilter || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
        }),
        adminApi.get("/admin/feedback/aggregate"),
      ]);
      setRows(fb.data.feedback);
      setTotal(fb.data.total);
      setAggregate(agg.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrash = async (p = trashPage) => {
    setTrashLoading(true);
    try {
      const res = await adminApi.get("/admin/feedback/trash", { params: { page: p, limit: PAGE_SIZE } });
      setTrashRows(res.data.feedback);
      setTrashTotal(res.data.total);
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => { fetchFeedback(1); setPage(1); activeSelection.clear(); }, [ratingFilter, dateFrom, dateTo]);
  useEffect(() => { fetchFeedback(page); activeSelection.clear(); }, [page]);
  useEffect(() => { if (view === "trash") fetchTrash(1); setTrashPage(1); trashSelection.clear(); }, [view]);
  useEffect(() => { if (view === "trash") fetchTrash(trashPage); trashSelection.clear(); }, [trashPage]);

  const applyFilter = (setter) => (e) => { setter(e.target.value); };

  const doAction = async () => {
    const { action, id } = confirm;
    setConfirm(null);
    try {
      if (action === "delete-one") {
        await adminApi.post("/admin/feedback/bulk-delete", { ids: [id] });
        setSuccessMessage("Feedback moved to trash.");
        fetchFeedback(page);
      }
      if (action === "bulk-delete") {
        const count = activeSelection.selected.size;
        await adminApi.post("/admin/feedback/bulk-delete", { ids: [...activeSelection.selected] });
        activeSelection.clear();
        setSuccessMessage(`${count} feedback entr${count === 1 ? "y" : "ies"} moved to trash.`);
        fetchFeedback(page);
      }
      if (action === "restore-one") {
        await adminApi.post("/admin/feedback/bulk-restore", { ids: [id] });
        setSuccessMessage("Feedback restored.");
        fetchTrash(trashPage);
      }
      if (action === "bulk-restore") {
        const count = trashSelection.selected.size;
        await adminApi.post("/admin/feedback/bulk-restore", { ids: [...trashSelection.selected] });
        trashSelection.clear();
        setSuccessMessage(`${count} feedback entr${count === 1 ? "y" : "ies"} restored.`);
        fetchTrash(trashPage);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "Something went wrong. Please try again.");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const trashTotalPages = Math.ceil(trashTotal / PAGE_SIZE);

  const allOnPageSelected = rows.length > 0 && rows.every((f) => activeSelection.selected.has(f.id));
  const columns = [
    { render: () => (
        <input type="checkbox" checked={allOnPageSelected} onChange={() => activeSelection.toggleAllOnPage(rows)}
          className="rounded border-gray-300" aria-label="Select all on this page" />
      ) },
    "Rating", "Submitted By", "Role", "Comment", "Submitted At", "Actions",
  ];
  const tableRows = rows.map((f) => {
    const submittedBy = f.user_full_name || f.guest_name;
    return (
      <>
        <td className="px-4 py-2 align-top">
          <input type="checkbox" checked={activeSelection.selected.has(f.id)} onChange={() => activeSelection.toggle(f.id)}
            className="rounded border-gray-300" aria-label={`Select feedback #${f.id}`} />
        </td>
        <td className="px-4 py-2 whitespace-nowrap align-top"><Stars value={f.rating} /></td>
        <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm whitespace-nowrap align-top">
          {submittedBy || <span className="text-gray-300 dark:text-wine-700">—</span>}
        </td>
        <td className="px-4 py-2 whitespace-nowrap align-top">
          {f.role ? (
            <span className="text-xs font-medium text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900 rounded-full px-2 py-0.5">
              {ROLE_LABELS[f.role] || f.role}
            </span>
          ) : (
            <span className="text-gray-300 dark:text-wine-700">—</span>
          )}
        </td>
        <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap break-words">{f.comment ?? <span className="text-gray-300 dark:text-wine-700">—</span>}</td>
        <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap align-top">{new Date(f.submitted_at).toLocaleString()}</td>
        <td className="px-4 py-2 align-top">
          <button onClick={() => setConfirm({ action: "delete-one", id: f.id, label: "Move this feedback to trash?" })}
            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
            <Trash2 size={12} />Delete
          </button>
        </td>
      </>
    );
  });

  const trashAllOnPageSelected = trashRows.length > 0 && trashRows.every((f) => trashSelection.selected.has(f.id));
  const trashColumns = [
    { render: () => (
        <input type="checkbox" checked={trashAllOnPageSelected} onChange={() => trashSelection.toggleAllOnPage(trashRows)}
          className="rounded border-gray-300" aria-label="Select all on this page" />
      ) },
    "Rating", "Submitted By", "Role", "Comment", "Deleted On", "Actions",
  ];
  const trashTableRows = trashRows.map((f) => {
    const submittedBy = f.user_full_name || f.guest_name;
    return (
      <>
        <td className="px-4 py-2 align-top">
          <input type="checkbox" checked={trashSelection.selected.has(f.id)} onChange={() => trashSelection.toggle(f.id)}
            className="rounded border-gray-300" aria-label={`Select feedback #${f.id}`} />
        </td>
        <td className="px-4 py-2 whitespace-nowrap align-top"><Stars value={f.rating} /></td>
        <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm whitespace-nowrap align-top">
          {submittedBy || <span className="text-gray-300 dark:text-wine-700">—</span>}
        </td>
        <td className="px-4 py-2 whitespace-nowrap align-top">
          {f.role ? (
            <span className="text-xs font-medium text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900 rounded-full px-2 py-0.5">
              {ROLE_LABELS[f.role] || f.role}
            </span>
          ) : (
            <span className="text-gray-300 dark:text-wine-700">—</span>
          )}
        </td>
        <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap break-words">{f.comment ?? <span className="text-gray-300 dark:text-wine-700">—</span>}</td>
        <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap align-top">{new Date(f.deleted_at).toLocaleString()}</td>
        <td className="px-4 py-2 align-top">
          <button onClick={() => setConfirm({ action: "restore-one", id: f.id, label: "Restore this feedback?" })}
            className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
            <RotateCcw size={12} />Restore
          </button>
        </td>
      </>
    );
  });

  const responseCount = aggregate?.total ?? 0;
  const distribution = aggregate?.distribution ?? {};
  const maxCount = Math.max(1, ...[1, 2, 3, 4, 5].map((r) => distribution[r] ?? 0));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Feedback</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">What students are saying about the Wi-Fi experience.</p>
      </div>

      {aggregate && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2 relative overflow-hidden bg-gradient-to-br from-pink-600 to-rose-500 rounded-2xl shadow-md shadow-pink-200 dark:shadow-none p-6 flex flex-col items-center justify-center text-white">
            <MessageSquareHeart size={120} className="absolute -right-6 -bottom-6 text-white/10" />
            <p className="text-xs font-medium text-pink-100 uppercase tracking-wide mb-2">Average Rating</p>
            <p className="text-5xl font-bold leading-none">{(aggregate.average ?? 0).toFixed(1)}</p>
            <div className="mt-3 inline-flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} size={18} strokeWidth={1.5}
                  className={s <= Math.round(aggregate.average ?? 0) ? "text-yellow-300 fill-yellow-300" : "text-white/30"} />
              ))}
            </div>
            <p className="text-xs text-pink-100 mt-2">
              {responseCount} response{responseCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="md:col-span-3 bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-5">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Rating Distribution</p>
            <div className="space-y-2.5">
              {[5, 4, 3, 2, 1].map((r) => {
                const count = distribution[r] ?? 0;
                const share = responseCount ? Math.round((count / responseCount) * 100) : 0;
                return (
                  <div key={r} className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 w-8 shrink-0 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {r} <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    </span>
                    <div className="flex-1 h-2.5 bg-slate-100 dark:bg-wine-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-400 transition-all duration-500"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                      {count} <span className="text-gray-300 dark:text-wine-700">({share}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {aggregate && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users2 size={15} className="text-pink-500 dark:text-pink-400" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Average Rating by Role</p>
            </div>
            {(aggregate.byRole ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-gray-500 py-8 text-center">No data yet.</p>
            ) : (
              <Bar
                data={{
                  labels: aggregate.byRole.map((r) => ROLE_LABELS[r.role] || r.role),
                  datasets: [{
                    label: "Average rating",
                    data: aggregate.byRole.map((r) => r.average),
                    backgroundColor: "#db2777",
                    hoverBackgroundColor: "#be185d",
                    borderRadius: 8,
                    maxBarThickness: 40,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: isDark ? "#40202f" : "#1e293b",
                      padding: 10,
                      cornerRadius: 8,
                      callbacks: {
                        label: (ctx) => {
                          const count = aggregate.byRole[ctx.dataIndex]?.count ?? 0;
                          return `${ctx.parsed.y.toFixed(1)} avg (${count} response${count === 1 ? "" : "s"})`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: isDark ? "#9ca3af" : "#64748b" } },
                    y: {
                      beginAtZero: true, max: 5,
                      ticks: { stepSize: 1, color: isDark ? "#9ca3af" : "#64748b" },
                      grid: { color: isDark ? "#40202f" : "#f1f5f9" },
                    },
                  },
                }}
              />
            )}
          </div>

          <div className="bg-white dark:bg-wine-900 rounded-2xl shadow-sm border border-slate-200 dark:border-wine-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-pink-500 dark:text-pink-400" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Average Rating Trend</p>
              <span className="text-xs text-slate-400 dark:text-gray-500 ml-auto">Last 30 days</span>
            </div>
            {(aggregate.byDate ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-gray-500 py-8 text-center">No data yet.</p>
            ) : (
              <Line
                data={{
                  labels: aggregate.byDate.map((d) => new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })),
                  datasets: [{
                    label: "Average rating",
                    data: aggregate.byDate.map((d) => d.average),
                    borderColor: "#db2777",
                    backgroundColor: "rgba(219,39,119,0.1)",
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: "#db2777",
                    tension: 0.3,
                    fill: true,
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: isDark ? "#40202f" : "#1e293b",
                      padding: 10,
                      cornerRadius: 8,
                      callbacks: {
                        label: (ctx) => {
                          const count = aggregate.byDate[ctx.dataIndex]?.count ?? 0;
                          return `${ctx.parsed.y.toFixed(1)} avg (${count} response${count === 1 ? "" : "s"})`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: isDark ? "#9ca3af" : "#64748b" } },
                    y: {
                      beginAtZero: true, max: 5,
                      ticks: { stepSize: 1, color: isDark ? "#9ca3af" : "#64748b" },
                      grid: { color: isDark ? "#40202f" : "#f1f5f9" },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>
      )}

      {view === "active" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <select value={ratingFilter} onChange={applyFilter(setRatingFilter)}
              className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400">
              <option value="">All Ratings</option>
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>{r} Star{r > 1 ? "s" : ""}</option>
              ))}
            </select>
            <input type="date" value={dateFrom} onChange={applyFilter(setDateFrom)}
              className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
            <input type="date" value={dateTo} onChange={applyFilter(setDateTo)}
              className="border border-slate-200 dark:border-wine-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-wine-900 focus:outline-none focus:ring-2 focus:ring-pink-400" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition ${
                  view === v.key ? "bg-pink-600 text-white shadow" : "bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
                }`}>
                {v.label}
              </button>
            ))}
            <button disabled={activeSelection.selected.size === 0}
              onClick={() => setConfirm({ action: "bulk-delete", label: `Move ${activeSelection.selected.size} feedback entr${activeSelection.selected.size === 1 ? "y" : "ies"} to trash?` })}
              className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium px-3 py-2 rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-pink-600">
              <Trash2 size={14} /> Delete Selected{activeSelection.selected.size > 0 ? ` (${activeSelection.selected.size})` : ""}
            </button>
          </div>
        </div>
      )}

      {view === "active" && (
        <AdminTable columns={columns} rows={tableRows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
          colWidths={["36px", "110px", "160px", "100px", null, "190px", "90px"]}
          emptyText="No feedback found."
          emptyHint="Try adjusting the rating or date filters." />
      )}

      {view === "trash" && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition ${
                  view === v.key ? "bg-pink-600 text-white shadow" : "bg-white dark:bg-wine-900 border border-pink-200 dark:border-pink-900 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-950/40"
                }`}>
                {v.label}
              </button>
            ))}
            <button disabled={trashSelection.selected.size === 0}
              onClick={() => setConfirm({ action: "bulk-restore", label: `Restore ${trashSelection.selected.size} feedback entr${trashSelection.selected.size === 1 ? "y" : "ies"}?` })}
              className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium px-3 py-2 rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-pink-600">
              <RotateCcw size={14} /> Restore Selected{trashSelection.selected.size > 0 ? ` (${trashSelection.selected.size})` : ""}
            </button>
          </div>

          <AdminTable columns={trashColumns} rows={trashTableRows} loading={trashLoading} page={trashPage} totalPages={trashTotalPages} onPage={setTrashPage}
            colWidths={["36px", "110px", "160px", "100px", null, "190px", "90px"]}
            emptyText="Trash is empty." />
        </>
      )}

      {confirm && <ConfirmDialog message={confirm.label} onConfirm={doAction} onCancel={() => setConfirm(null)} />}
      {successMessage && (
        <ConfirmDialog
          title="Success"
          message={successMessage}
          confirmLabel="OK"
          danger={false}
          onConfirm={() => setSuccessMessage("")}
          onCancel={() => setSuccessMessage("")}
        />
      )}
      {errorMessage && (
        <ConfirmDialog
          title="Something went wrong"
          message={errorMessage}
          confirmLabel="OK"
          onConfirm={() => setErrorMessage("")}
          onCancel={() => setErrorMessage("")}
        />
      )}
    </div>
  );
}
