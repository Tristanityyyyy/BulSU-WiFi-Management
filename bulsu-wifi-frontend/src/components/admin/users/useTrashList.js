import { useEffect, useState } from "react";
import * as usersApi from "./usersApi";
import useSelectableSet from "../useSelectableSet";

// Trashed-user list: state, filters, fetch, and selection. Only fetches while
// `active` is true (the parent only wants trash data loaded when its tab is shown).
export default function useTrashList({ pageSize, active }) {
  const [trashUsers, setTrashUsers] = useState([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashPage, setTrashPage] = useState(1);
  const [trashLoading, setTrashLoading] = useState(true);
  const [trashSearch, setTrashSearch] = useState("");
  const [trashFilterRole, setTrashFilterRole] = useState("");
  const [trashFilterCourse, setTrashFilterCourse] = useState("");
  const [trashFilterSection, setTrashFilterSection] = useState("");
  const selection = useSelectableSet();

  const fetchTrash = async (p = trashPage) => {
    setTrashLoading(true);
    try {
      const res = await usersApi.fetchTrash({
        page: p, limit: pageSize, search: trashSearch,
        role: trashFilterRole, course_id: trashFilterCourse, section_id: trashFilterSection,
      });
      setTrashUsers(res.data.users);
      setTrashTotal(res.data.total);
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    if (active) fetchTrash(1);
    setTrashPage(1);
    selection.clear();
  }, [active, trashSearch, trashFilterRole, trashFilterCourse, trashFilterSection]);

  useEffect(() => {
    if (active) fetchTrash(trashPage);
    selection.clear();
  }, [trashPage]);

  return {
    trashUsers, trashTotal, trashPage, setTrashPage, trashLoading,
    trashSearch, setTrashSearch,
    trashFilterRole, setTrashFilterRole,
    trashFilterCourse, setTrashFilterCourse,
    trashFilterSection, setTrashFilterSection,
    selection, fetchTrash,
  };
}
