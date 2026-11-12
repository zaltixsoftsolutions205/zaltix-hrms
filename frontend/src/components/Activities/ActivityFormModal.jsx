import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarDays, Clock, FileText, Loader2, Paperclip, Pencil, Star, Tag, Trash2, User,
} from 'lucide-react';
import Modal from '../UI/Modal';
import { combineDateTime, dayKey, formatDay, formatTime, toTimeInput, visitDayInput } from '../Visits/visitDates';
import { mainText, Stars } from './ActivityCards';
import { entryDate } from './activityTypes';
import { FieldControl } from '../GlobalTable/CellEditors';
import CellDisplay from '../GlobalTable/CellDisplay';
import { getTypeMeta, isEmptyValue, toApiValue, toEditorValue } from '../GlobalTable/fieldTypes';

/**
 * Add / view / edit one entry of a lead activity (visit, demo, data update,
 * registration, feedback).
 *   Fields: from `mainFields` (date, time, text, select, number, file, rating,
 *   user = assignee picked from `assignees`, actor = the employee who submitted,
 *   read-only). Times are saved on the entry's date. Fields with
 *   section: 'details' are drawn in the "Details" section.
 *   Custom fields: `detail.customFields`, the lead table's fields with "Show in"
 *   set to this activity; values in entry.customValues by field id, drawn in
 *   "More details".
 * The backend checks every rule again (required fields, who may edit, stage).
 */

// A lead-table field as the GlobalTable controls expect it.
const customCol = (f) => ({ key: f._id, label: f.label, type: f.type, source: 'custom', field: f, editable: false });
const customKey = (f) => `custom.${f._id}`;
const customRequired = (f) => Boolean(f.required) && getTypeMeta(f.type).editor !== 'toggle';
const customFilled = (f, v) => (f.type === 'checkbox' ? v === true : !isEmptyValue(v));

function CustomValue({ field, value }) {
  if (field.type === 'checkbox' || field.type === 'boolean') {
    return <span className="text-sm font-medium text-gray-800">{value === true ? 'Yes' : value === false ? 'No' : '—'}</span>;
  }
  return <div className="text-sm min-w-0"><CellDisplay col={customCol(field)} lead={{}} raw={value} userLookup={{}} /></div>;
}

const labelClass = 'block text-xs font-medium text-violet-700 mb-1';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';

function StarInput({ value, onChange, disabled, invalid }) {
  return (
    <div role="radiogroup" aria-label="Rating" className={`flex items-center gap-1 rounded-lg ${invalid ? 'ring-1 ring-red-500 px-1' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="w-8 h-8 rounded-lg hover:bg-amber-50"
        >
          <Star size={20} className={n <= (value || 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
        </button>
      ))}
    </div>
  );
}

const isLongText = (m) => m.type === 'text' && (m.max || 100) > 200;
const STATUS_KEYS = ['demoStatus', 'updateStatus', 'registrationStatus', 'visitType'];

// One card of the summary strip (same look as the lead drawer's).
function Card({ icon: Icon, label, children, accent = false }) {
  return (
    <div className={`rounded-xl border border-violet-100 px-3 py-2 min-w-0 ${accent ? 'bg-violet-50/60' : 'bg-white'}`}>
      <p className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${accent ? 'text-violet-500' : 'text-gray-400'}`}><Icon size={11} /> {label}</p>
      <div className="mt-1 text-sm font-medium text-gray-800 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Read-only view of a saved entry: a summary strip (date + time, who, status or
 * rating), the filled fields as tiles, then the long notes. Empty fields are
 * listed in one line at the bottom.
 */
function EntryView({ page, mainFields, customFields = [], entry }) {
  const dateField = mainFields.find((m) => m.type === 'date');
  const times = mainFields.filter((m) => m.type === 'time');
  const people = mainFields.filter((m) => m.type === 'user' || m.type === 'actor');
  const badge = mainFields.find((m) => m.type === 'rating' && m.required)
    || STATUS_KEYS.map((k) => mainFields.find((m) => m.key === k)).find(Boolean);
  const rest = mainFields.filter((m) => m !== dateField && m !== badge && !times.includes(m) && !people.includes(m));
  const notes = rest.filter(isLongText);
  const facts = rest.filter((m) => !isLongText(m));

  const filled = (m) => (m.type === 'file' || m.type === 'rating' ? Boolean(entry[m.key]) : Boolean(mainText(m, entry[m.key])));
  const shownFacts = facts.filter(filled);
  const shownNotes = notes.filter(filled);
  const empty = rest.filter((m) => !filled(m));
  const customValues = entry.customValues || {};
  const shownCustom = customFields.filter((f) => customFilled(f, customValues[f._id]));
  const emptyCustom = customFields.filter((f) => !shownCustom.includes(f));
  const emptyLabels = [...empty.map((m) => m.label), ...emptyCustom.map((f) => f.label)];

  const [from, to] = times.map((t) => entry[t.key]);
  const personName = (m) => (m.type === 'actor' ? entry.visitedBy?.name : entry[m.key]?.name) || '—';

  const value = (m) => {
    const v = entry[m.key];
    if (m.type === 'rating') return <Stars value={v} size={16} />;
    if (m.type === 'file') {
      return (
        <button
          type="button"
          onClick={() => page.api.openFile(entry._id).catch((err) => toast.error(err.message))}
          className="gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 max-w-full"
        >
          <Paperclip size={12} className="flex-shrink-0" /> <span className="truncate">{v.originalName || 'View file'}</span>
        </button>
      );
    }
    const text = mainText(m, v);
    if (m.format === 'url') return <a href={text} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-violet-700 underline break-all">{text}</a>;
    if (m.format === 'phone') return <a href={`tel:${text}`} className="text-sm font-medium text-violet-700 hover:underline">{text}</a>;
    if (m.type === 'select') return <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-semibold">{text}</span>;
    return <span className="text-sm font-medium text-gray-800 break-words">{text}</span>;
  };

  const created = entry.createdAt && new Date(entry.createdAt);
  const updated = entry.updatedAt && new Date(entry.updatedAt);
  const recorder = entry.createdBy?.name || entry.visitedBy?.name;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card icon={CalendarDays} label={dateField?.label || 'Date'} accent>
          <span className="block">{formatDay(entryDate(mainFields, entry)) || '—'}</span>
          {times.length > 0 && (
            <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-gray-500">
              <Clock size={11} /> {from || to ? `${formatTime(from) || '—'} – ${formatTime(to) || '—'}` : 'No time recorded'}
            </span>
          )}
        </Card>
        {people.map((m) => (
          <Card key={m.key} icon={User} label={m.label}><span className="block truncate">{personName(m)}</span></Card>
        ))}
        {badge && (
          <Card icon={badge.type === 'rating' ? Star : Tag} label={badge.label}>
            {badge.type === 'rating' ? <Stars value={entry[badge.key]} size={16} />
              : mainText(badge, entry[badge.key])
                ? <span className="rounded-full bg-violet-600 text-white px-2 py-0.5 text-xs font-semibold">{mainText(badge, entry[badge.key])}</span>
                : <span className="text-gray-400">Not set</span>}
          </Card>
        )}
      </div>

      {shownFacts.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {shownFacts.map((m) => (
              <div key={m.key} className={`rounded-lg px-3 py-2 bg-gray-50/70 min-w-0 ${m.type === 'file' || m.format === 'url' ? 'sm:col-span-2' : ''}`}>
                <span className="block text-[11px] font-medium text-gray-400">{m.label}</span>
                <div className="min-h-[1.5rem] flex items-center min-w-0">{value(m)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {shownCustom.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">More details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {shownCustom.map((f) => (
              <div key={f._id} className={`rounded-lg px-3 py-2 bg-gray-50/70 min-w-0 ${f.type === 'multi-select' || (f.type === 'text' && String(customValues[f._id]).length > 60) ? 'sm:col-span-2' : ''}`}>
                <span className="block text-[11px] font-medium text-gray-400">{f.label}</span>
                <div className="min-h-[1.5rem] flex items-center min-w-0 break-words"><CustomValue field={f} value={customValues[f._id]} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {shownNotes.length > 0 && (
        <section className="space-y-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Notes</h4>
          {shownNotes.map((m) => (
            <div key={m.key} className="rounded-xl border border-violet-100 bg-white px-3 py-2.5">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-violet-600"><FileText size={12} /> {m.label}</p>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{entry[m.key]}</p>
            </div>
          ))}
        </section>
      )}

      {shownFacts.length === 0 && shownNotes.length === 0 && shownCustom.length === 0 && (
        <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">No details recorded for this {page.noun}.</p>
      )}

      {emptyLabels.length > 0 && (shownFacts.length > 0 || shownNotes.length > 0 || shownCustom.length > 0) && (
        <p className="text-[11px] text-gray-400"><span className="font-semibold">Not recorded:</span> {emptyLabels.join(', ')}</p>
      )}

      {(recorder || created) && (
        <p className="border-t border-gray-100 pt-2 text-[11px] text-gray-400">
          {recorder ? `Recorded by ${recorder}` : 'Recorded'}
          {created && !Number.isNaN(created.getTime()) && ` on ${created.toLocaleDateString()}`}
          {updated && created && updated.getTime() - created.getTime() > 60000 && ` · last updated ${updated.toLocaleString()}`}
        </p>
      )}
    </div>
  );
}

// An existing entry opens read-only; "Edit" (when allowed) switches to the form,
// "Cancel" goes back to the read-only view (same as a lead).
// viewOnly: always read-only (lead drawer / lead page show entries without editing).
export default function ActivityFormModal({
  page, detail, entry, currentUser, onClose, onSaved, onDeleted, viewOnly = false,
}) {
  const { lead, mainFields, assignees = [], customFields = [] } = detail;
  const api = page.api;
  const isNew = !entry;
  const canEdit = Boolean(entry && !viewOnly && entry.canEdit);
  const [editing, setEditing] = useState(isNew);
  const readOnly = !isNew && !editing;
  const dateField = mainFields.find((m) => m.type === 'date');
  const topFields = mainFields.filter((m) => m.section !== 'details');
  const detailFields = mainFields.filter((m) => m.section === 'details');

  const initialValues = () => {
    const out = {};
    mainFields.forEach((m) => {
      const raw = entry?.[m.key];
      if (m.type === 'date') out[m.key] = entry ? visitDayInput(raw) : dayKey(new Date());
      else if (m.type === 'time') out[m.key] = toTimeInput(raw);
      else if (m.type === 'user') out[m.key] = entry ? idOf(raw) : (assignees.some((a) => a._id === currentUser?._id) ? currentUser._id : '');
      else if (m.type === 'rating') out[m.key] = raw || 0;
      else if (m.type === 'text' || m.type === 'select') out[m.key] = raw || '';
      else if (m.type === 'number') out[m.key] = raw ?? '';
    });
    return out;
  };
  const [main, setMain] = useState(initialValues);
  const initialCustom = () => Object.fromEntries(customFields.map((f) => [f._id, toEditorValue(customCol(f), entry?.customValues?.[f._id])]));
  const [custom, setCustom] = useState(initialCustom);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState({}); // file main fields: the File picked, uploaded after saving

  // Cancel an edit: drop the changes and show the entry read-only again.
  const cancelEdit = () => {
    setMain(initialValues());
    setCustom(initialCustom());
    setFiles({});
    setErrors({});
    setFormError('');
    setEditing(false);
  };

  const clearError = (key) => setErrors((e) => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });
  const setMainValue = (key, value) => { setMain((m) => ({ ...m, [key]: value })); clearError(key); };
  const setCustomValue = (f, value) => { setCustom((c) => ({ ...c, [f._id]: value })); clearError(customKey(f)); };

  const submit = async (e) => {
    e.preventDefault();
    if (saving || readOnly) return;
    const errs = {};
    const body = {};
    const day = dateField ? main[dateField.key] : '';
    mainFields.forEach((m) => {
      const v = main[m.key];
      if (m.type === 'date') { if (!v && m.required) errs[m.key] = `${m.label} is required`; body[m.key] = v; }
      if (m.type === 'time') body[m.key] = combineDateTime(day, v);
      if (m.type === 'text') { if (!String(v || '').trim() && m.required) errs[m.key] = `${m.label} is required`; body[m.key] = v; }
      if (m.type === 'rating') { if (!v && m.required) errs[m.key] = `Pick a ${m.label.toLowerCase()}`; body[m.key] = v || null; }
      if (m.type === 'select') { if (!v && m.required) errs[m.key] = `${m.label} is required`; body[m.key] = v; }
      if (m.type === 'number') {
        if (v === '' || v === null) { if (m.required) errs[m.key] = `${m.label} is required`; body[m.key] = null; }
        else if (!Number.isFinite(Number(v)) || Number(v) < 0) errs[m.key] = `${m.label} must be 0 or more`;
        else body[m.key] = Number(v);
      }
      if (m.type === 'user') { if (!v && m.required) errs[m.key] = `Choose who ${page.noun === 'feedback' ? 'took it' : 'did it'}`; body[m.key] = v || undefined; }
    });
    body.customValues = {};
    customFields.forEach((f) => {
      try {
        const v = toApiValue(customCol(f), custom[f._id]);
        if (customRequired(f) && isEmptyValue(v)) errs[customKey(f)] = `${f.label} is required`;
        body.customValues[f._id] = v;
      } catch (err) {
        errs[customKey(f)] = err.message;
      }
    });
    const [t1, t2] = mainFields.filter((m) => m.type === 'time');
    if (t1 && t2 && main[t1.key] && main[t2.key] && main[t2.key] < main[t1.key]) errs[t2.key] = `${t2.label} cannot be before ${t1.label.toLowerCase()}`;
    setErrors(errs);
    if (Object.keys(errs).length) { setFormError('Fix the highlighted fields'); return; }

    setSaving(true);
    setFormError('');
    try {
      const saved = isNew ? await api.create(lead._id, body) : await api.update(entry._id, body);
      // Files go up after the entry exists (multipart); a failed upload keeps the saved entry.
      for (const [key, file] of Object.entries(files)) {
        if (!file) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          Object.assign(saved, await api.uploadFile(saved._id, file));
        } catch (uploadErr) {
          toast.error(`${page.label} saved, but the ${key} upload failed: ${uploadErr.message}. Open it to try again.`);
        }
      }
      toast.success(isNew ? `${page.label} saved` : `${page.label} updated`);
      onSaved(saved, { isNew });
    } catch (err) {
      const byField = {};
      (err.errors || []).forEach((x) => { byField[x.fieldId || x.field] = x.message; });
      setErrors(byField);
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete this ${page.noun} and everything recorded in it? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.remove(entry._id);
      toast.success(`${page.label} deleted`);
      onDeleted(entry);
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  const errorText = (key) => errors[key] && <p role="alert" className="mt-1 text-[11px] text-red-600">{errors[key]}</p>;
  const input = (key) => `input-field w-full ${errors[key] ? 'border-red-500' : ''}`;

  const mainControl = (m) => {
    const id = `act-${m.key}`;
    const label = <label className={labelClass} htmlFor={id}>{m.label}{m.required ? ' *' : ''}</label>;
    switch (m.type) {
      case 'date': return <div key={m.key}>{label}<input id={id} type="date" className={input(m.key)} value={main[m.key]} disabled={readOnly} onChange={(e) => setMainValue(m.key, e.target.value)} />{errorText(m.key)}</div>;
      case 'time': return <div key={m.key}>{label}<input id={id} type="time" className={input(m.key)} value={main[m.key]} disabled={readOnly} onChange={(e) => setMainValue(m.key, e.target.value)} />{errorText(m.key)}</div>;
      case 'text': return <div key={m.key}>{label}<input id={id} type="text" maxLength={m.max || 100} className={input(m.key)} value={main[m.key]} disabled={readOnly} onChange={(e) => setMainValue(m.key, e.target.value)} />{errorText(m.key)}</div>;
      case 'select': return (
        <div key={m.key}>
          {label}
          {readOnly ? (
            <p className="input-field w-full bg-gray-50 text-gray-600">{mainText(m, main[m.key]) || '—'}</p>
          ) : (
            <select id={id} className={input(m.key)} value={main[m.key]} onChange={(e) => setMainValue(m.key, e.target.value)}>
              <option value="">Select…</option>
              {(m.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {errorText(m.key)}
        </div>
      );
      case 'number': return (
        <div key={m.key}>
          {label}
          <div className="relative">
            {m.currency && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>}
            <input id={id} type="number" min="0" step={m.currency ? '0.01' : 'any'} className={`${input(m.key)} ${m.currency ? '!pl-7' : ''}`} value={main[m.key]} disabled={readOnly} onChange={(e) => setMainValue(m.key, e.target.value)} />
          </div>
          {errorText(m.key)}
        </div>
      );
      case 'file': {
        const stored = entry?.[m.key];
        return (
          <div key={m.key} className="sm:col-span-2">
            <span className={labelClass}>{m.label}</span>
            {stored && (
              <button
                type="button"
                onClick={() => api.openFile(entry._id).catch((err) => toast.error(err.message))}
                className="mb-1.5 gap-1.5 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
              >
                <Paperclip size={13} /> {stored.originalName || 'View file'}
              </button>
            )}
            {!readOnly && (
              <input
                id={id}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-violet-700 hover:file:bg-violet-100"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && file.size > 5 * 1024 * 1024) { toast.error('The file can be at most 5 MB'); e.target.value = ''; return; }
                  setFiles((f) => ({ ...f, [m.key]: file }));
                }}
              />
            )}
            {!readOnly && <p className="mt-1 text-[11px] text-gray-400">PDF, JPG or PNG, up to 5 MB.{stored ? ' Choosing a file replaces the current one.' : ''}</p>}
            {readOnly && !stored && <p className="text-sm text-gray-500">—</p>}
          </div>
        );
      }
      case 'rating': return (
        <div key={m.key}>
          <span className={labelClass}>{m.label}{m.required ? ' *' : ''}</span>
          {readOnly ? <Stars value={main[m.key]} size={18} /> : <StarInput value={main[m.key]} disabled={readOnly} invalid={Boolean(errors[m.key])} onChange={(v) => setMainValue(m.key, v)} />}
          {errorText(m.key)}
        </div>
      );
      case 'user': {
        const current = entry?.[m.key];
        const options = assignees.some((a) => a._id === idOf(current)) || !current ? assignees : [current, ...assignees];
        return (
          <div key={m.key}>
            {label}
            {readOnly ? (
              <p className="input-field w-full bg-gray-50 text-gray-600">{current?.name || '—'}</p>
            ) : (
              <select id={id} className={input(m.key)} value={main[m.key]} onChange={(e) => setMainValue(m.key, e.target.value)}>
                <option value="">Select an employee</option>
                {options.map((a) => <option key={a._id} value={a._id}>{a.name}{a.employeeId ? ` (${a.employeeId})` : ''}</option>)}
              </select>
            )}
            {errorText(m.key)}
          </div>
        );
      }
      case 'actor': return (
        <div key={m.key}>
          <span className={labelClass}>{m.label}</span>
          <p className="input-field w-full bg-gray-50 text-gray-600">{entry?.[m.key]?.name || currentUser?.name || '—'}</p>
        </div>
      );
      default: return null;
    }
  };

  const who = entry?.createdBy?.name || entry?.visitedBy?.name;
  const title = isNew ? `New ${page.noun} · ${lead.name}` : `${readOnly ? page.label : `Edit ${page.noun}`} · ${lead.name}`;

  return (
    <>
      <Modal isOpen onClose={saving ? () => {} : onClose} title={title} size="lg">
        <form onSubmit={submit} className="space-y-5" noValidate>
          {readOnly ? (
            <EntryView page={page} mainFields={mainFields} customFields={customFields} entry={entry} />
          ) : (
            <>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{page.label}</h3>
                <div className="grid gap-3 sm:grid-cols-2">{topFields.map(mainControl)}</div>
              </section>

              {detailFields.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">{detailFields.map(mainControl)}</div>
                </section>
              )}

              {customFields.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">More details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {customFields.map((f) => (
                      <div key={f._id} className={f.type === 'multi-select' ? 'sm:col-span-2' : ''}>
                        <label className={labelClass}>{f.label}{customRequired(f) ? ' *' : ''}</label>
                        <FieldControl
                          col={customCol(f)}
                          value={custom[f._id]}
                          userLookup={{}}
                          dense={false}
                          invalid={Boolean(errors[customKey(f)])}
                          onChange={(v) => setCustomValue(f, v)}
                        />
                        {f.description && <p className="mt-1 text-[11px] text-gray-400">{f.description}</p>}
                        {errorText(customKey(f))}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          {/* canEditPage: edit permission on the page's module (from the server) */}
          {readOnly && detail.canEditPage === false && <p className="text-xs text-gray-500">You have view-only access to {page.title}, so this {page.noun} cannot be changed.</p>}
          {readOnly && !viewOnly && !entry.canEdit && detail.canEditPage !== false && <p className="text-xs text-gray-500">Only {who || 'the employee who recorded it'}, the assigned employee, or admin / HR / a manager, can change this {page.noun}.</p>}
          {readOnly && viewOnly && entry.canEdit && <p className="text-xs text-gray-500">To change this {page.noun}, open it on the {page.title} page.</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {!isNew && !readOnly && (
                <button type="button" onClick={remove} disabled={saving} className="gap-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 disabled:opacity-50">
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
            {readOnly ? (
              <div key="view" className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Close</button>
                {canEdit && (
                  <button type="button" onClick={() => setEditing(true)} className="btn-primary btn-sm gap-1.5">
                    <Pencil size={14} /> Edit
                  </button>
                )}
              </div>
            ) : (
              <div key="edit" className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={isNew ? onClose : cancelEdit} disabled={saving}>Cancel</button>
                <button type="submit" className="btn-primary btn-sm gap-1.5" disabled={saving}>
                  {saving && <Loader2 size={14} className="animate-spin" />} {isNew ? 'Submit' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
