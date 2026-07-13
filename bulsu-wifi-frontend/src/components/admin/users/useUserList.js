import { useEffect, useState } from "react";
import * as usersApi from "./usersApi";
import useSelectableSet from "../useSelectableSet";

// Active-user list: state, filters, fetch, and selection for one page of results.
export default function useUserList({ pageSize }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEnrollment, setFilterEnrollment] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const selection = useSelectableSet();

  const fetchUsers = async (p = page) => {
    setLoading(true);
    try {
      const res = await usersApi.fetchUsers({
        page: p, limit: pageSize, search, status: filterStatus, enrollment_status: filterEnrollment,
        role: filterRole, course_id: filterCourse, section_id: filterSection,
      });
      setUsers(res.data.users);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(1); setPage(1); selection.clear(); }, [search, filterStatus, filterEnrollment, filterRole, filterCourse, filterSection]);
  useEffect(() => { fetchUsers(page); selection.clear(); }, [page]);

  return {
    users, total, page, setPage, loading,
    search, setSearch,
    filterStatus, setFilterStatus,
    filterEnrollment, setFilterEnrollment,
    filterRole, setFilterRole,
    filterCourse, setFilterCourse,
    filterSection, setFilterSection,
    selection, fetchUsers,
  };
}
