const ExcelJS = require('exceljs');

const BRAND_PINK = 'FFDB2777';

function styleHeaderCell(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PINK } };
  cell.alignment = { vertical: 'middle' };
}

// Builds a branded xlsx workbook: title/subtitle banner + header row + data.
// - `rows` are real records rendered via each column's `value(row)`, with optional
//   `statusColors` ({value: argbColor}) applied to the column whose key is 'status'.
// - `exampleRows` are plain value-arrays rendered as italic gray placeholders (used by
//   blank templates that ship with sample data instead of real rows).
// - `dataValidations` is [{column, fromRow, toRow, formulae, type?, allowBlank?}].
// - `extraSheets` is [(workbook) => void] for additional worksheets (e.g. reference data).
async function buildBrandedWorkbook({
  title,
  subtitle,
  sheetName,
  columns,
  rows = [],
  statusColors = null,
  exampleRows = [],
  dataValidations = [],
  extraSheets = [],
}) {
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
  subtitleCell.alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(2).height = 28;

  const headerRow = sheet.getRow(3);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    styleHeaderCell(cell);
  });
  headerRow.height = 20;

  columns.forEach((col, i) => {
    if (col.dateFormat) sheet.getColumn(i + 1).numFmt = 'yyyy-mm-dd hh:mm';
  });

  const statusColIndex = statusColors ? columns.findIndex((c) => c.key === 'status') : -1;
  rows.forEach((row) => {
    const r = sheet.addRow(columns.map((col) => col.value(row)));
    r.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { vertical: 'middle' }; });
    if (statusColIndex !== -1) {
      r.getCell(statusColIndex + 1).font = { bold: true, color: { argb: statusColors[row.status] || 'FF6B7280' } };
    }
  });

  exampleRows.forEach((values) => {
    const r = sheet.addRow(values);
    r.eachCell({ includeEmpty: true }, (cell) => { cell.font = { italic: true, color: { argb: 'FF9CA3AF' } }; });
  });

  dataValidations.forEach(({ column, fromRow, toRow, formulae, type = 'list', allowBlank = true }) => {
    for (let r = fromRow; r <= toRow; r += 1) {
      sheet.getCell(`${column}${r}`).dataValidation = { type, allowBlank, formulae };
    }
  });

  extraSheets.forEach((build) => build(workbook));

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

module.exports = { BRAND_PINK, styleHeaderCell, buildBrandedWorkbook, sendWorkbook };
