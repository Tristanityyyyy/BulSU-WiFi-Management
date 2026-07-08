const router = require('express').Router();
const db = require('../../db');
const ExcelJS = require('exceljs');

const BRAND_PINK = 'FFDB2777';
const STATUS_COLORS = {
  active: 'FF16A34A',
  ended: 'FF6B7280',
  'force-disconnected': 'FFDC2626',
  timeout: 'FFEA580C',
};

const humanize = (value) => (value || '').toString().split(/[_-]/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const formatDuration = (mins) => {
  if (mins == null) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const describeFilters = (query, extra = {}) => {
  const parts = [];
  if (query.date_from || query.date_to) parts.push(`${query.date_from || 'earliest'} to ${query.date_to || 'latest'}`);
  if (query.status) parts.push(`status: ${humanize(query.status)}`);
  if (query.logout_reason) parts.push(`reason: ${humanize(query.logout_reason)}`);
  Object.entries(extra).forEach(([label, value]) => { if (value) parts.push(`${label}: ${humanize(value)}`); });
  return parts.length ? `Filtered by ${parts.join(', ')}.` : 'No filters applied.';
};

async function buildSessionWorkbook({ title, subtitle, sheetName, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BulSU Wi-Fi Admin';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 3 }] });
  columns.forEach((col, i) => { sheet.getColumn(i + 1).width = col.width; });

  const lastCol = String.fromCharCode(64 + columns.length);

  sheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(`A2:${lastCol}2`);
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = subtitle;
  subtitleCell.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  subtitleCell.alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 22;

  const headerRow = sheet.getRow(3);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
    cell.alignment = { vertical: 'middle' };
  });
  headerRow.height = 20;

  columns.forEach((col, i) => {
    if (col.dateFormat) sheet.getColumn(i + 1).numFmt = 'yyyy-mm-dd hh:mm';
  });

  const statusColIndex = columns.findIndex((c) => c.key === 'status');
  rows.forEach((row) => {
    const r = sheet.addRow(columns.map((col) => col.value(row)));
    r.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { vertical: 'middle' }; });
    if (statusColIndex !== -1) {
      r.getCell(statusColIndex + 1).font = { bold: true, color: { argb: STATUS_COLORS[row.status] || 'FF6B7280' } };
    }
  });

  return workbook;
}

async function sendWorkbook(res, workbook, filename) {
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  res.send(Buffer.from(buffer));
}

function buildDateFilter(query, alias, userAlias = null) {
  const { date_from, date_to, status = '', logout_reason = '', role = '' } = query;
  const params = [];
  let where = 'WHERE 1=1';
  if (date_from)    { where += ` AND ${alias}.login_time >= ?`; params.push(date_from); }
  if (date_to)      { where += ` AND ${alias}.login_time <= ?`; params.push(date_to + ' 23:59:59'); }
  if (status)       { where += ` AND ${alias}.status = ?`; params.push(status); }
  if (logout_reason){ where += ` AND ${alias}.logout_reason = ?`; params.push(logout_reason); }
  if (role && userAlias) { where += ` AND ${userAlias}.role = ?`; params.push(role); }
  return { where, params };
}

// GET /api/admin/sessions
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { where, params } = buildDateFilter(req.query, 's', 'u');
    const [sessions] = await db.query(`
      SELECT s.id, u.full_name, u.student_number, u.role, d.mac_address, s.ip_address,
             s.login_time, s.logout_time, s.status, s.logout_reason,
             TIMESTAMPDIFF(MINUTE, s.login_time, COALESCE(s.logout_time, NOW())) AS duration_minutes
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      JOIN devices d ON s.device_id = d.id
      ${where} ORDER BY s.login_time DESC LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM sessions s JOIN users u ON s.user_id = u.id ${where}`, params
    );
    res.json({ sessions, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
});

// GET /api/admin/sessions/export
router.get('/export', async (req, res) => {
  try {
    const { where, params } = buildDateFilter(req.query, 's', 'u');
    const [rows] = await db.query(`
      SELECT u.student_number, u.full_name, u.role, d.mac_address, s.ip_address,
             s.login_time, s.logout_time, s.status, s.logout_reason,
             TIMESTAMPDIFF(MINUTE, s.login_time, COALESCE(s.logout_time, NOW())) AS duration_minutes
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      JOIN devices d ON s.device_id = d.id
      ${where} ORDER BY s.login_time DESC
    `, params);

    const role = req.query.role || '';
    const roleLabel = role ? humanize(role) : 'All Roles';
    const columns = [
      { header: 'Full Name', width: 26, value: (r) => r.full_name },
      { header: 'Student/Employee No.', width: 20, value: (r) => r.student_number || '—' },
      { header: 'Role', width: 12, value: (r) => humanize(r.role) },
      { header: 'MAC Address', width: 18, value: (r) => r.mac_address },
      { header: 'IP Address', width: 15, value: (r) => r.ip_address },
      { header: 'Login Time', width: 20, dateFormat: true, value: (r) => (r.login_time ? new Date(r.login_time) : null) },
      { header: 'Logout Time', width: 20, dateFormat: true, value: (r) => (r.logout_time ? new Date(r.logout_time) : null) },
      { header: 'Duration', width: 12, value: (r) => formatDuration(r.duration_minutes) },
      { header: 'Status', key: 'status', width: 16, value: (r) => humanize(r.status) },
      { header: 'Logout Reason', width: 18, value: (r) => (r.logout_reason ? humanize(r.logout_reason) : '—') },
    ];

    const workbook = await buildSessionWorkbook({
      title: `BulSU Wi-Fi — ${roleLabel} Session Log`,
      subtitle: `Generated ${new Date().toLocaleString()}. ${describeFilters(req.query)}`,
      sheetName: 'Sessions',
      columns,
      rows,
    });
    await sendWorkbook(res, workbook, `${role || 'all'}-sessions-${Date.now()}.xlsx`);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export sessions.' });
  }
});

// GET /api/admin/sessions/guests
router.get('/guests', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { where, params } = buildDateFilter(req.query, 'gs');
    const [sessions] = await db.query(`
      SELECT gs.id, gs.guest_name, gs.mac_address, gs.ip_address,
             gs.login_time, gs.logout_time, gs.status,
             TIMESTAMPDIFF(MINUTE, gs.login_time, COALESCE(gs.logout_time, NOW())) AS duration_minutes
      FROM guest_sessions gs
      ${where} ORDER BY gs.login_time DESC LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM guest_sessions gs ${where}`, params);
    res.json({ sessions, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch guest sessions.' });
  }
});

// GET /api/admin/sessions/guests/export
router.get('/guests/export', async (req, res) => {
  try {
    const { where, params } = buildDateFilter(req.query, 'gs');
    const [rows] = await db.query(`
      SELECT gs.guest_name, gs.mac_address, gs.ip_address,
             gs.login_time, gs.logout_time, gs.status,
             TIMESTAMPDIFF(MINUTE, gs.login_time, COALESCE(gs.logout_time, NOW())) AS duration_minutes
      FROM guest_sessions gs
      ${where} ORDER BY gs.login_time DESC
    `, params);

    const columns = [
      { header: 'Guest Name', width: 26, value: (r) => r.guest_name },
      { header: 'MAC Address', width: 18, value: (r) => r.mac_address },
      { header: 'IP Address', width: 15, value: (r) => r.ip_address },
      { header: 'Login Time', width: 20, dateFormat: true, value: (r) => (r.login_time ? new Date(r.login_time) : null) },
      { header: 'Logout Time', width: 20, dateFormat: true, value: (r) => (r.logout_time ? new Date(r.logout_time) : null) },
      { header: 'Duration', width: 12, value: (r) => formatDuration(r.duration_minutes) },
      { header: 'Status', key: 'status', width: 16, value: (r) => humanize(r.status) },
    ];

    const workbook = await buildSessionWorkbook({
      title: 'BulSU Wi-Fi — Guest Session Log',
      subtitle: `Generated ${new Date().toLocaleString()}. ${describeFilters(req.query)}`,
      sheetName: 'Guest Sessions',
      columns,
      rows,
    });
    await sendWorkbook(res, workbook, `guest-sessions-${Date.now()}.xlsx`);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export guest sessions.' });
  }
});

module.exports = router;
