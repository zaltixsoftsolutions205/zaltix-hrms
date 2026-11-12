import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, ListChecks, Loader2, Upload, X } from 'lucide-react';
import api from '../../utils/api';
import Modal from '../UI/Modal';
import { downloadImportTemplate } from './excelTemplate';

/**
 * Template / Import / Export for one Mandal table. Columns come from the
 * table itself (GET /global-tables/:id/import-spec), so every table gets its
 * own file layout. Validation happens on the server: one bad cell fails the
 * whole import and the report lists every problem by row, column and value.
 */

const MAX_ROWS = 1000;
const pad = (n) => String(n).padStart(2, '0');

// Real Excel date cells arrive as Date objects; the server expects DD-MM-YYYY.
const cellToValue = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()}`;
    return value.getHours() || value.getMinutes() ? `${day} ${pad(value.getHours())}:${pad(value.getMinutes())}` : day;
  }
  return typeof value === 'string' ? value.trim() : value;
};

const safeName = (name) => String(name || 'table').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'table';

const widths = (rows) => rows[0].map((_, c) => ({ wch: Math.min(48, Math.max(12, ...rows.map((r) => String(r[c] ?? '').length + 2))) }));

// selectMode / onToggleSelectMode: the "Delete multiple" switch that shows the row checkboxes.
// canImport: false for view-only access (Template and Export stay).
export default function GlobalTableExcelActions({ tableId, onImported, selectMode = false, onToggleSelectMode, canImport = true }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(''); // 'template' | 'import' | 'export'
  const [report, setReport] = useState(null); // { message, errors, totalErrors }

  const downloadTemplate = async () => {
    setBusy('template');
    try {
      const { data: spec } = await api.get(`/global-tables/${tableId}/import-spec`);
      // Dropdowns for select / stage / Yes-No / Employee ID columns (see excelTemplate.js)
      await downloadImportTemplate(spec, `${safeName(spec.fileName)} - template.xlsx`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to build the template');
    } finally {
      setBusy('');
    }
  };

  const exportTable = async () => {
    setBusy('export');
    try {
      const { data } = await api.get(`/global-tables/${tableId}/export`);
      const rows = [data.headers, ...data.rows];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = widths(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, `${safeName(data.fileName)}.xlsx`);
      toast.success(`Exported ${data.rows.length} lead${data.rows.length !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export');
    } finally {
      setBusy('');
    }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('Choose an .xlsx file');
      return;
    }
    setBusy('import');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      const headers = (aoa[0] || []).map((h) => String(h ?? '').trim());
      const rows = aoa.slice(1)
        .map((cells, i) => ({ rowNumber: i + 2, cells: headers.map((_, c) => cellToValue(cells[c])) }))
        .filter((row) => row.cells.some((v) => v !== '' && v !== null && v !== undefined));
      if (!headers.some(Boolean)) throw new Error('The first row must hold the column headers');
      if (!rows.length) throw new Error('The file has no data rows');
      if (rows.length > MAX_ROWS) throw new Error(`At most ${MAX_ROWS} rows per import (this file has ${rows.length})`);

      const { data } = await api.post(`/global-tables/${tableId}/import`, { headers, rows });
      toast.success(`Imported ${data.total} row${data.total !== 1 ? 's' : ''}: ${data.created} created, ${data.updated} updated`);
      onImported?.();
    } catch (err) {
      const body = err.response?.data;
      if (err.response?.status === 422 && body?.details?.errors) {
        setReport({ message: body.message, errors: body.details.errors, totalErrors: body.details.totalErrors });
      } else {
        toast.error(body?.message || err.message || 'Import failed');
      }
    } finally {
      setBusy('');
    }
  };

  const downloadReport = () => {
    const rows = [['Row', 'Column', 'Value', 'Problem'], ...report.errors.map((e) => [e.row, e.column, e.value, e.message])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 28 }, { wch: 70 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import errors');
    XLSX.writeFile(wb, 'import-errors.xlsx');
  };

  const button = 'inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors';
  const icon = (name, Icon) => (busy === name ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />);

  return (
    <>
      <div className="flex items-center justify-end gap-2 flex-wrap px-3 py-2 border-b border-violet-100 bg-violet-50/40">
        <button type="button" className={button} disabled={Boolean(busy)} onClick={downloadTemplate} title="Download an empty sheet with this table's columns">
          {icon('template', FileSpreadsheet)} Template
        </button>
        {canImport && (
          <button type="button" className={button} disabled={Boolean(busy)} onClick={() => fileRef.current?.click()} title="Create or update leads from an .xlsx file">
            {icon('import', Upload)} Import
          </button>
        )}
        <button type="button" className={button} disabled={Boolean(busy)} onClick={exportTable} title="Download this table as .xlsx">
          {icon('export', Download)} Export
        </button>
        {onToggleSelectMode && (
          <button
            type="button"
            onClick={onToggleSelectMode}
            aria-pressed={selectMode}
            title={selectMode ? 'Hide the row checkboxes' : 'Select several rows and delete them'}
            className={selectMode
              ? 'inline-flex items-center gap-1.5 rounded-lg border border-violet-600 bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 transition-colors'
              : 'inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors'}
          >
            {selectMode ? <X size={13} /> : <ListChecks size={13} />} {selectMode ? 'Cancel selection' : 'Delete multiple'}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={importFile} />
      </div>

      <Modal isOpen={Boolean(report)} onClose={() => setReport(null)} title="Import failed — nothing was saved" size="lg">
        {report && (
          <div className="space-y-3">
            <p className="text-sm text-red-700">{report.message}</p>
            {report.totalErrors > report.errors.length && (
              <p className="text-xs text-gray-500">Showing the first {report.errors.length} of {report.totalErrors} problems.</p>
            )}
            <div className="max-h-[50vh] overflow-auto border border-red-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-red-50 text-red-800 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 w-14">Row</th>
                    <th className="text-left px-2 py-1.5">Column</th>
                    <th className="text-left px-2 py-1.5">Value</th>
                    <th className="text-left px-2 py-1.5">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((e, i) => (
                    <tr key={i} className="border-t border-red-50">
                      <td className="px-2 py-1.5 tabular-nums">{e.row}</td>
                      <td className="px-2 py-1.5 font-medium">{e.column}</td>
                      <td className="px-2 py-1.5 text-gray-600 break-all">{e.value || '—'}</td>
                      <td className="px-2 py-1.5">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={downloadReport}>Download error report</button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setReport(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
