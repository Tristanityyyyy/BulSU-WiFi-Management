import adminApi from "../adminApi";

export const fetchUsers = (params) => adminApi.get("/admin/users", { params });
export const fetchTrash = (params) => adminApi.get("/admin/users/trash", { params });

export const createUser = (payload) => adminApi.post("/admin/users", payload);
export const updateUser = (id, payload) => adminApi.put(`/admin/users/${id}`, payload);

export const blockUser = (id) => adminApi.patch(`/admin/users/${id}/block`);
export const unblockUser = (id) => adminApi.patch(`/admin/users/${id}/unblock`);
export const resetPassword = (id, password) => adminApi.patch(`/admin/users/${id}/reset-password`, { password });

export const restoreUser = (id) => adminApi.patch(`/admin/users/${id}/restore`);
export const bulkRestore = (ids) => adminApi.post("/admin/users/bulk-restore", { ids });
export const bulkDelete = (ids) => adminApi.post("/admin/users/bulk-delete", { ids });
export const permanentDelete = (id, password) => adminApi.delete(`/admin/users/${id}/permanent`, { data: { password } });
export const bulkPermanentDelete = (ids, password) => adminApi.post("/admin/users/bulk-permanent-delete", { ids, password });

export const checkExisting = (studentNumbers) => adminApi.post("/admin/users/check-existing", { student_numbers: studentNumbers });

export const transitionTemplate = () => adminApi.get("/admin/users/transition/template", { responseType: "blob" });
export const transitionValidate = (rows) => adminApi.post("/admin/users/transition/validate", { rows });
export const transitionCommit = (rows) => adminApi.post("/admin/users/transition/commit", { rows });
export const parseXlsx = (arrayBuffer) =>
  adminApi.post("/admin/users/parse-xlsx", arrayBuffer, { headers: { "Content-Type": "application/octet-stream" } });
export const csvImport = (rows, role) => adminApi.post("/admin/users/csv-import", { rows, role });
export const csvTemplate = (role) => adminApi.get("/admin/users/csv-template", { params: { role }, responseType: "blob" });
