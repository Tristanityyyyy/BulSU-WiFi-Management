import { useEffect, useState } from "react";
import adminApi from "./adminApi";
import useSelectableSet from "./useSelectableSet";

// Active-feedback list: state, filters, fetch, and selection for one page of
// results — mirrors the users/useUserList.js pattern instead of reinventing it.
// Also fetches the aggregate stats alongside the page of rows since both are
// always needed together on this screen.
//
// The filter effect and the page effect are split so a filter change (which also
// resets to page 1) doesn't cause both effects to fetch page 1 independently: the
// page effect only fetches when `page` actually moved off 1.
export default function useFeedbackList({ pageSize }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState(null);
  const [ratingFilter, setRatingFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const selection = useSelectableSet();

  const fetchFeedback = async (p = page) => {
    setLoading(true);
    try {
      const [fb, agg] = await Promise.all([
        adminApi.get("/admin/feedback", {
          params: {
            page: p,
            limit: pageSize,
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

  useEffect(() => { setPage(1); selection.clear(); fetchFeedback(1); }, [ratingFilter, dateFrom, dateTo]);
  useEffect(() => { if (page !== 1) { fetchFeedback(page); selection.clear(); } }, [page]);

  return {
    rows, total, page, setPage, loading, aggregate,
    ratingFilter, setRatingFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    selection, fetchFeedback,
  };
}
