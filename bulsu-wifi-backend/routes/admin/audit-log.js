const router = require('express').Router();
const db = require('../../db');
const ExcelJS = require('exceljs');

const BRAND_PINK = 'FFDB2777';
const VALID_EXPORT_DAYS = [7, 14, 30, 60];

function buildFilter(query) {
  const { action = '', date_from = '', date_to = '' } = query;
  const params = [];
  let where = 'WHERE 1=1';
  if (action)    { where += ' AND action = ?'; params.push(action); }
  if (date_from) { where += ' AND created_at >= ?'; params.push(date_from); }
  if (date_to)   { where += ' AND created_at <= ?'; params.push(date_to + ' 23:59:59'); }
  return { where, params };
}

// GET /api/admin/audit-log
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { where, params } = buildFilter(req.query);

    const [logs] = await db.query(
      `SELECT id, admin_name, action, target_type, target_name, description, created_at
       FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, params);
    res.json({ logs, total });
  } catch (err) {
    console.error('GET /admin/audit-log failed:', err);
    res.status(500).json({ message: 'Failed to fetch audit logs.' });
  }
});

// GET /api/admin/audit-log/export?days=7|14|30|60
router.get('/export', async (req, res) => {
  try {
    const days = VALID_EXPORT_DAYS.includes(Number(req.query.days)) ? Number(req.query.days) : 7;

    const [logs] = await db.query(
      `SELECT admin_name, action, target_type, target_name, description, created_at
       FROM audit_logs WHERE created_at >= NOW() - INTERVAL ? DAY
       ORDER BY created_at DESC`,
      [days]
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BulSU Wi-Fi Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Audit Log', { views: [{ state: 'frozen', ySplit: 3 }] });
    const columns = [
      { header: 'Time', width: 20 },
      { header: 'Admin', width: 22 },
      { header: 'Action', width: 12 },
      { header: 'Target', width: 28 },
      { header: 'Description', width: 60 },
    ];
    columns.forEach((col, i) => { sheet.getColumn(i + 1).width = col.width; });

    sheet.mergeCells('A1:E1');
    const title = sheet.getCell('A1');
    title.value = 'BulSU Wi-Fi — Admin Audit Log';
    title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
    title.alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 26;

    sheet.mergeCells('A2:E2');
    const subtitle = sheet.getCell('A2');
    subtitle.value = `Generated ${new Date().toLocaleString()}. Last ${days} days.`;
    subtitle.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
    subtitle.alignment = { vertical: 'middle' };
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

    logs.forEach((log) => {
      const r = sheet.addRow([
        new Date(log.created_at),
        log.admin_name,
        log.action,
        log.target_name || '—',
        log.description,
      ]);
      r.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { vertical: 'middle', wrapText: true }; });
      r.getCell(1).numFmt = 'yyyy-mm-dd hh:mm';
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="audit-log-last-${days}-days-${Date.now()}.xlsx"`,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('GET /admin/audit-log/export failed:', err);
    res.status(500).json({ message: 'Failed to export audit log.' });
  }
});

module.exports = router;
