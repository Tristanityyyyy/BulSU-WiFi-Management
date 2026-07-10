const db = require("../db");

const ACTIONS = {
  CREATED: "CREATED",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  BLOCKED: "BLOCKED",
  UNBLOCKED: "UNBLOCKED",
  RESTORE: "RESTORE",
};

async function logAudit(req, { action, target_type = null, target_name = null, description, metadata = null }) {
  try {
    const adminId = req.user?.id ?? null;
    let adminName = "Unknown";
    if (adminId) {
      const [[admin]] = await db.query("SELECT full_name FROM users WHERE id = ?", [adminId]);
      adminName = admin?.full_name || "Unknown";
    }
    await db.query(
      "INSERT INTO audit_logs (admin_id, admin_name, action, target_type, target_name, description, metadata, created_at) VALUES (?,?,?,?,?,?,?,NOW())",
      [adminId, adminName, action, target_type, target_name, description, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error("logAudit failed:", err);
  }
}

module.exports = { logAudit, ACTIONS };
