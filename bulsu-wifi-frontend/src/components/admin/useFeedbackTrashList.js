import { useEffect, useState } from "react";
import adminApi from "./adminApi";
import useSelectableSet from "./useSelectableSet";

// Trashed-feedback list: state, fetch, and selection — mirrors
// users/useTrashList.js. Only fetches while `active` is true (the parent only
// wants trash data loaded when its tab is shown), and resets to page 1
// whenever the tab is (re)opened.
export default function useFeedbackTrashList({ pageSize, active }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const selection = useSelectableSet();

  const fetchTrash = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/feedback/trash", { params: { page: p, limit: pageSize } });
      setRows(res.data.feedback);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    selection.clear();
    if (active) fetchTrash(1);
  }, [active]);

  useEffect(() => {
    if (page !== 1 && active) { fetchTrash(page); selection.clear(); }
  }, [page]);

  return { rows, total, page, setPage, loading, selection, fetchTrash };
}
