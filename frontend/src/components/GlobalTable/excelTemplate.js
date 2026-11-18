/**
 * Builds the import template of a Mandal table with Excel dropdowns.
 *
 * SheetJS (the `xlsx` package used for import / export) cannot write data
 * validation, so the template uses ExcelJS, loaded only when a template is
 * downloaded. Every dropdown reads its values from the hidden "Lists" sheet
 * (no 255-character limit, and the lists stay readable when unhidden).
 *
 *   single select, Pipeline Stage, Yes/No, Assign To -> dropdown, other values rejected
 *   multi select, person -> dropdown for one value; typing several separated by
 *                           commas is allowed (Excel cannot pick several)
 *   dates -> DD-MM-YYYY hint; numbers -> must be a number
 * The server still validates every cell on import.
 */

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
const REQUIRED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDD6FE' } };

const colLetter = (n) => {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

const DATE_TYPES = ['followUp', 'date', 'datetime'];
const NUMBER_TYPES = ['number', 'currency'];

/** Excel limits prompt titles to 32 and messages to 255 characters. */
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function downloadImportTemplate(spec, fileName) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const data = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  const help = wb.addWorksheet('Instructions');
  const lastRow = (spec.maxRows || 1000) + 1;

  // Header row
  data.columns = spec.columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: Math.min(40, Math.max(16, c.header.length + 4, ...(c.options || []).map((o) => String(o).length + 4))),
  }));
  data.getRow(1).eachCell((cell, i) => {
    const column = spec.columns[i - 1];
    cell.font = { bold: true, color: { argb: 'FF4C1D95' } };
    cell.fill = column.required ? REQUIRED_FILL : HEADER_FILL;
    cell.alignment = { vertical: 'middle' };
    const note = [column.required ? 'Required. ' : '', column.help || ''].join('').trim();
    if (note) cell.note = note;
  });
  data.getRow(1).height = 22;

  let listCol = 0;
  spec.columns.forEach((column, i) => {
    const letter = colLetter(i + 1);
    const range = `${letter}2:${letter}${lastRow}`;

    if (column.options && column.options.length) {
      listCol += 1;
      const lc = colLetter(listCol);
      lists.getCell(`${lc}1`).value = column.header;
      lists.getCell(`${lc}1`).font = { bold: true };
      column.options.forEach((option, j) => { lists.getCell(`${lc}${j + 2}`).value = String(option); });
      lists.getColumn(listCol).width = Math.max(14, column.header.length + 2);

      const several = column.multiple;
      data.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${lc}$2:$${lc}$${column.options.length + 1}`],
        showInputMessage: true,
        promptTitle: clip(column.header, 32),
        prompt: clip(several
          ? `Pick one, or type several separated by commas (e.g. ${column.options.slice(0, 2).join(', ')}).`
          : `Pick a value from the list.${column.required ? ' Required.' : ''}`, 255),
        // Several values typed by hand must still be accepted.
        showErrorMessage: !several,
        errorStyle: 'stop',
        errorTitle: 'Not in the list',
        error: clip(`Use one of the values in the dropdown for "${column.header}".`, 255),
      });
      return;
    }

    if (DATE_TYPES.includes(column.type)) {
      data.getColumn(i + 1).numFmt = column.type === 'datetime' ? 'dd-mm-yyyy hh:mm' : 'dd-mm-yyyy';
      data.dataValidations.add(range, {
        type: 'custom',
        allowBlank: true,
        formulae: ['TRUE'],
        showInputMessage: true,
        promptTitle: clip(column.header, 32),
        prompt: column.type === 'datetime' ? 'Date and time as DD-MM-YYYY HH:mm' : 'Date as DD-MM-YYYY',
      });
      return;
    }

    if (NUMBER_TYPES.includes(column.type)) {
      data.dataValidations.add(range, {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [-1e15, 1e15],
        showInputMessage: true,
        promptTitle: clip(column.header, 32),
        prompt: column.type === 'currency' ? 'Amount, up to 2 decimals' : 'A number',
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Not a number',
        error: `"${column.header}" must be a number.`,
      });
      return;
    }

    if (column.help) {
      data.dataValidations.add(range, {
        type: 'custom',
        allowBlank: true,
        formulae: ['TRUE'],
        showInputMessage: true,
        promptTitle: clip(column.header, 32),
        prompt: clip(`${column.required ? 'Required. ' : ''}${column.help}`, 255),
      });
    }
  });

  // Instructions
  help.columns = [{ width: 30 }, { width: 10 }, { width: 60 }, { width: 50 }];
  const headRow = help.addRow(['Column', 'Required', 'How to fill', 'Allowed values']);
  headRow.font = { bold: true };
  headRow.eachCell((c) => { c.fill = HEADER_FILL; });
  spec.columns.forEach((c) => {
    const allowed = c.options && c.options.length
      ? (c.options.length > 15 ? `${c.options.slice(0, 15).join(', ')} … (dropdown)` : c.options.join(', '))
      : '';
    help.addRow([c.header, c.required ? 'Yes' : 'No', c.help || '', allowed]);
  });
  help.addRow([]);
  help.addRow(['Notes']).font = { bold: true };
  [
    'Fill the "Data" sheet. Columns with a dropdown only accept its values; multi select and person columns also accept several values separated by commas.',
    `Dates are ${spec.dateFormat}. At most ${spec.maxRows} rows per file. Darker headers are required.`,
    'Product, Address and Mandal are filled from the table; do not add them.',
    'If any cell is invalid, nothing is imported and every problem is listed.',
  ].forEach((line) => help.addRow([line]));

  if (spec.employees && spec.employees.length) {
    help.addRow([]);
    help.addRow(['Employees']).font = { bold: true };
    const empHead = help.addRow(['Employee ID', '', 'Name', 'Role']);
    empHead.font = { bold: true };
    spec.employees.forEach((e) => help.addRow([e.employeeId, '', e.name, e.role]));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
