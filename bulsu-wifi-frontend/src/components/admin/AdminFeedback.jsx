import { useEffect, useState } from "react";
import { Star, MessageSquareHeart } from "lucide-react";
import adminApi from "./adminApi";
import AdminTable from "./AdminTable";

const PAGE_SIZE = 20;

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
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState(null);
  const [ratingFilter, setRatingFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  useEffect(() => { fetchFeedback(page); }, [page, ratingFilter, dateFrom, dateTo]);

  const applyFilter = (setter) => (e) => { setter(e.target.value); setPage(1); };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const columns = ["Rating", "Comment", "Submitted At"];
  const tableRows = rows.map((f) => (
    <>
      <td className="px-4 py-2 whitespace-nowrap align-top"><Stars value={f.rating} /></td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap break-words">{f.comment ?? <span className="text-gray-300 dark:text-wine-700">—</span>}</td>
      <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap align-top">{new Date(f.submitted_at).toLocaleString()}</td>
    </>
  ));

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

      <AdminTable columns={columns} rows={tableRows} loading={loading} page={page} totalPages={totalPages} onPage={setPage}
        colWidths={["150px", null, "190px"]}
        emptyText="No feedback found."
        emptyHint="Try adjusting the rating or date filters." />
    </div>
  );
}
