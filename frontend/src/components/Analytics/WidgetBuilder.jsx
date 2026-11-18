import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle, ArrowLeftRight, AreaChart, BarChart3, Filter, Hash, LineChart, ListOrdered, PieChart, Plus, Table, TrendingUp, X,
} from 'lucide-react';
import AnalyticsService, { errorOf } from '../../services/AnalyticsService';
import Spinner from '../UI/Spinner';
import ChartRenderer from './charts/ChartRenderer';
import ConditionList, { inputCls } from './ConditionList';
import DateRangeInput from './DateRangeInput';
import {
  INTERVALS, LIMITS, buildConfig, columnFields, dateFields, defaultDraft, draftFromWidget, fieldOf, groupFields, measureFields, sectionOfPath,
} from './builderModel';
import { formatRange } from './format';

export const CHART_ICONS = {
  score: Hash, growth: TrendingUp, ranking: ListOrdered, bar: BarChart3, donut: PieChart, line: LineChart, area: AreaChart, butterfly: ArrowLeftRight, table: Table, funnel: Filter,
};
const CHART_HINTS = {
  score: 'One number', growth: 'This period vs last', ranking: 'Top N list', bar: 'Compare groups', donut: 'Share of a whole', line: 'Trend over time', area: 'Volume over time', butterfly: 'Two values side by side', table: 'Rows of data', funnel: 'Step-by-step drop-off',
};

function Section({ title, hint, error, children }) {
  return (
    <section className={`rounded-xl border p-3 sm:p-4 ${error ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="mb-2.5">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {children}
      {error && <p className="mt-2 flex items-start gap-1 text-xs text-red-700"><AlertCircle size={14} className="flex-shrink-0 mt-px" />{error}</p>}
    </section>
  );
}

const Label = ({ children }) => <span className="block text-xs font-semibold text-gray-600 mb-1">{children}</span>;

/** One value: calculation, field, optional "only count where" conditions, label. */
function MeasureEditor({ index, measure, source, catalog, onChange, onRemove, fixedCalc }) {
  const calc = catalog.calcs.find((c) => c.key === measure.calc);
  const fields = measureFields(source, calc);
  const set = (patch) => onChange({ ...measure, ...patch });
  const [showWhere, setShowWhere] = useState(measure.where?.length > 0);
  const whereOpen = showWhere || calc?.needsWhere;

  const changeCalc = (key) => {
    const next = catalog.calcs.find((c) => c.key === key);
    const nextFields = measureFields(source, next);
    set({ calc: key, field: next?.fieldTypes ? (nextFields.some((f) => f.key === measure.field) ? measure.field : nextFields[0]?.key || null) : null });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 space-y-2">
      {(index !== null || onRemove) && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">{index !== null ? `Value ${index + 1}` : 'Value'}</span>
          {onRemove && <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600" aria-label="Remove value"><X size={15} /></button>}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <Label>Calculation</Label>
          <select className={inputCls} value={measure.calc} onChange={(e) => changeCalc(e.target.value)} disabled={fixedCalc}>
            {catalog.calcs.map((c) => (
              <option key={c.key} value={c.key} disabled={c.fieldTypes && !measureFields(source, c).length}>{c.label}</option>
            ))}
          </select>
        </label>
        {calc?.fieldTypes ? (
          <label className="block">
            <Label>Of field</Label>
            <select className={inputCls} value={measure.field || ''} onChange={(e) => set({ field: e.target.value })}>
              <option value="" disabled>Choose…</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
        ) : (
          <div className="text-xs text-gray-500 self-end pb-2">
            {calc?.key === 'conversion' ? `% of ${source.label.toLowerCase()} that meet the condition below` : `Number of ${source.label.toLowerCase()}`}
          </div>
        )}
      </div>
      {whereOpen ? (
        <div>
          <Label>{calc?.needsWhere ? 'Counts as converted when' : 'Only include records where'}</Label>
          <ConditionList source={source} value={measure.where} onChange={(where) => set({ where })} addLabel="Add condition"
            emptyText={calc?.needsWhere ? 'Add the condition, e.g. Pipeline stage is Lead Won.' : null} />
        </div>
      ) : (
        <button type="button" onClick={() => setShowWhere(true)} className="text-xs font-semibold text-violet-700 hover:text-violet-900 gap-1"><Plus size={14} /> Only include some records</button>
      )}
      <label className="block">
        <Label>Label (optional)</Label>
        <input className={inputCls} value={measure.label || ''} maxLength={80} placeholder="Shown in the chart" onChange={(e) => set({ label: e.target.value })} />
      </label>
    </div>
  );
}

/**
 * "Add Analytics" builder: data -> chart -> values -> grouping -> dates -> filters -> options,
 * with a live preview. `widget` = a saved widget to edit, or null for a new one.
 */
export default function WidgetBuilder({ catalog, widget, onClose, onSaved }) {
  const sources = useMemo(() => catalog.modules.flatMap((m) => m.sources), [catalog]);
  const [draft, setDraft] = useState(() => {
    if (widget) return draftFromWidget(catalog, widget);
    const first = sources[0];
    return defaultDraft(catalog, first?.key, 'bar');
  });
  const source = sources.find((s) => s.key === draft.source);
  const chart = catalog.charts.find((c) => c.key === draft.chartType);
  const type = draft.chartType;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const config = useMemo(() => (source ? buildConfig(draft, catalog) : null), [draft, catalog, source]);
  const configKey = JSON.stringify(config);

  /* ---------------- live preview ---------------- */
  const [preview, setPreview] = useState({ loading: false, result: null, error: null });
  const [page, setPage] = useState(1);
  const seq = useRef(0);
  useEffect(() => { setPage(1); }, [configKey]);
  useEffect(() => {
    if (!config) return undefined;
    const id = ++seq.current;
    setPreview((p) => ({ ...p, loading: true }));
    const t = setTimeout(() => {
      AnalyticsService.preview(config, { page })
        .then((result) => { if (id === seq.current) setPreview({ loading: false, result, error: null }); })
        .catch((err) => { if (id === seq.current) setPreview({ loading: false, result: null, error: errorOf(err) }); });
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, page]);

  const errSection = sectionOfPath(preview.error?.path);
  const errFor = (s) => (errSection === s ? preview.error.message : null);

  /* ---------------- save ---------------- */
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  const save = async () => {
    if (!draft.title.trim()) { setTitleError('Enter a title'); return; }
    setSaving(true);
    try {
      const body = { title: draft.title.trim(), description: draft.description.trim(), config };
      const saved = widget ? await AnalyticsService.updateWidget(widget._id, body) : await AnalyticsService.createWidget(body);
      toast.success(widget ? 'Widget updated' : 'Widget saved');
      onSaved(saved);
    } catch (err) {
      const e = errorOf(err);
      if (e.path === 'title') setTitleError(e.message);
      else setPreview({ loading: false, result: null, error: e });
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  if (!source) {
    return null;
  }

  /* ---------------- section content ---------------- */
  const pickSource = (key) => setDraft((d) => defaultDraft(catalog, key, d.chartType, d));
  const pickChart = (key) => setDraft((d) => defaultDraft(catalog, d.source, key, d));
  const grouped = type === 'table' && draft.table.mode === 'grouped';
  const showMeasures = type !== 'funnel' && (type !== 'table' || grouped);
  const showCategory = chart.category === 'required' || grouped;
  const timeline = type === 'line' || type === 'area';
  const catFields = groupFields(source, { allowDate: type !== 'ranking' && type !== 'butterfly' });
  const catField = fieldOf(source, draft.category.field);
  const seriesFields = groupFields(source, { allowDate: false }).filter((f) => f.key !== draft.category.field || timeline);
  const enumFields = source.fields.filter((f) => f.type === 'enum');
  const [minM, maxM] = type === 'table' ? [1, 4] : chart.measures;
  const setMeasure = (i, m) => set({ measures: draft.measures.map((x, j) => (j === i ? m : x)) });
  const limits = LIMITS[type];
  const cols = columnFields(source);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-violet-950/40 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div role="dialog" aria-modal="true" aria-label={widget ? 'Edit analytics' : 'Add analytics'}
        className="relative z-10 w-full max-w-7xl h-full sm:h-[92vh] bg-gray-50 sm:rounded-2xl shadow-2xl border border-violet-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white flex-shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-violet-900">{widget ? 'Edit analytics' : 'Add analytics'}</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary !py-1.5">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary !py-1.5">{saving ? 'Saving…' : widget ? 'Save changes' : 'Save widget'}</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* Form */}
          <div className="lg:w-[46%] lg:overflow-y-auto p-3 sm:p-4 space-y-3 order-2 lg:order-1">
            <Section title="Title" error={titleError}>
              <input className={inputCls} value={draft.title} maxLength={120} placeholder="e.g. Visits by employee this month"
                onChange={(e) => { set({ title: e.target.value }); setTitleError(''); }} />
              <input className={`${inputCls} mt-2`} value={draft.description} maxLength={500} placeholder="Description (optional)" onChange={(e) => set({ description: e.target.value })} />
            </Section>

            <Section title="1. Data" hint="Which records to analyse.">
              {catalog.modules.length > 1 && (
                <select className={`${inputCls} mb-2`} value={draft.module} onChange={(e) => pickSource(catalog.modules.find((m) => m.key === e.target.value).sources[0].key)}>
                  {catalog.modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(catalog.modules.find((m) => m.key === draft.module)?.sources || []).map((s) => (
                  <button key={s.key} type="button" onClick={() => pickSource(s.key)}
                    className={`!justify-start rounded-lg border px-3 py-2 text-sm font-semibold ${s.key === draft.source ? 'border-violet-500 bg-violet-50 text-violet-800 ring-1 ring-violet-300' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="2. Chart">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {catalog.charts.map((c) => {
                  const Icon = CHART_ICONS[c.key] || BarChart3;
                  const on = c.key === type;
                  return (
                    <button key={c.key} type="button" onClick={() => pickChart(c.key)} title={CHART_HINTS[c.key]}
                      className={`!flex flex-col !items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] font-semibold leading-tight ${on ? 'border-violet-500 bg-violet-50 text-violet-800 ring-1 ring-violet-300' : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300'}`}>
                      <Icon size={20} />
                      <span className="text-center">{c.label.replace(/ (Chart|List|Card|Index)$/, '')}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">{CHART_HINTS[type]}</p>
            </Section>

            {type === 'table' && (
              <Section title="Table type">
                <div className="flex gap-2">
                  {[['records', 'List of records'], ['grouped', 'Totals by group']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set({ table: { ...draft.table, mode: k } })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${draft.table.mode === k ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {showMeasures && (
              <Section title={`3. ${maxM > 1 ? 'Values' : 'Value'}`} hint={type === 'butterfly' ? 'The first value is drawn on the left, the second on the right.' : 'What to calculate.'} error={errFor('value')}>
                <div className="space-y-2">
                  {draft.measures.map((m, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <MeasureEditor key={i} index={maxM > 1 ? i : null} measure={m} source={source} catalog={catalog}
                      onChange={(next) => setMeasure(i, next)}
                      onRemove={draft.measures.length > minM ? () => set({ measures: draft.measures.filter((_, j) => j !== i) }) : null} />
                  ))}
                  {draft.measures.length < maxM && (
                    <button type="button" onClick={() => set({ measures: [...draft.measures, { calc: 'count', field: null, where: [], label: '' }] })} className="text-xs font-semibold text-violet-700 hover:text-violet-900 gap-1"><Plus size={14} /> Add value</button>
                  )}
                </div>
              </Section>
            )}

            {(showCategory || timeline) && (
              <Section title={timeline ? '4. Over time' : '4. Group by'} error={errFor('group') || (timeline ? errFor('date') : null)}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {timeline ? (
                    <>
                      <label className="block">
                        <Label>Date field</Label>
                        <select className={inputCls} value={draft.dateField} onChange={(e) => set({ dateField: e.target.value })}>
                          {dateFields(source).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <Label>One point per</Label>
                        <select className={inputCls} value={draft.interval} onChange={(e) => set({ interval: e.target.value })}>
                          {INTERVALS.map((k) => <option key={k} value={k}>{catalog.buckets.find((b) => b.key === k)?.label || k}</option>)}
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="block">
                        <Label>Field</Label>
                        <select className={inputCls} value={draft.category.field} onChange={(e) => {
                          const f = fieldOf(source, e.target.value);
                          set({ category: { field: e.target.value, bucket: f?.type === 'date' ? draft.category.bucket || 'month' : null } });
                        }}>
                          <option value="" disabled>Choose…</option>
                          {catFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </label>
                      {catField?.type === 'date' && (
                        <label className="block">
                          <Label>By</Label>
                          <select className={inputCls} value={draft.category.bucket || 'month'} onChange={(e) => set({ category: { ...draft.category, bucket: e.target.value } })}>
                            {catalog.buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  {chart.series && (
                    <label className="block sm:col-span-2">
                      <Label>Split by (optional)</Label>
                      <select className={inputCls} value={draft.series?.field || ''} onChange={(e) => set({ series: { field: e.target.value, bucket: null } })}>
                        <option value="">No split</option>
                        {seriesFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <span className="block mt-1 text-[11px] text-gray-500">{timeline ? 'One line per value' : 'Stacked bars'} · up to 8, the rest is grouped as "Other".</span>
                    </label>
                  )}
                </div>
              </Section>
            )}

            <Section title={`${showCategory || timeline ? '5' : showMeasures ? '4' : '3'}. Date range`} error={timeline ? null : errFor('date')}
              hint={type === 'growth' ? 'All time compares this period so far with the same days of the previous one. A fixed range is compared with the same length before it.' : null}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {!timeline && (
                  <label className="block">
                    <Label>Date field</Label>
                    <select className={inputCls} value={draft.dateField} onChange={(e) => set({ dateField: e.target.value })}>
                      {dateFields(source).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </label>
                )}
                <div className={timeline ? 'sm:col-span-2' : ''}>
                  <Label>Range</Label>
                  <DateRangeInput value={draft.dateRange} presets={catalog.datePresets} onChange={(dateRange) => set({ dateRange })} />
                </div>
                {type === 'growth' && (
                  <label className="block">
                    <Label>Compare by</Label>
                    <select className={inputCls} value={draft.interval} onChange={(e) => set({ interval: e.target.value })}>
                      {INTERVALS.map((k) => <option key={k} value={k}>{catalog.buckets.find((b) => b.key === k)?.label || k}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </Section>

            <Section title="Filters" hint="Only records that match every filter are used." error={errFor('filters')}>
              <ConditionList source={source} value={draft.filters} onChange={(filters) => set({ filters })} />
            </Section>

            {(limits || type === 'score' || type === 'funnel' || (type === 'table' && !grouped)) && (
              <Section title="Options" error={errFor('options')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {limits && (
                    <label className="block">
                      <Label>{type === 'donut' ? 'Slices (rest = Other)' : type === 'table' && !grouped ? 'Rows' : 'Show top'}</Label>
                      <input type="number" min={limits[0]} max={limits[1]} className={inputCls} value={draft.limit ?? ''} onChange={(e) => set({ limit: e.target.value === '' ? '' : Number(e.target.value) })} />
                    </label>
                  )}
                  {['ranking', 'bar', 'donut', 'butterfly'].includes(type) || grouped ? (
                    <label className="block">
                      <Label>Sort</Label>
                      <select className={inputCls} value={draft.sort} onChange={(e) => set({ sort: e.target.value })}>
                        <option value="auto">Automatic</option>
                        <option value="desc">Largest first</option>
                        <option value="asc">Smallest first</option>
                        <option value="label">A–Z</option>
                      </select>
                    </label>
                  ) : null}
                  {['bar', 'donut', 'ranking'].includes(type) || grouped ? (
                    <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                      <input type="checkbox" className="accent-violet-600" checked={draft.percent} onChange={(e) => set({ percent: e.target.checked })} />
                      Show % of total (Count or Sum)
                    </label>
                  ) : null}

                  {type === 'score' && (
                    <>
                      <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                        <input type="checkbox" className="accent-violet-600" checked={draft.compare} onChange={(e) => set({ compare: e.target.checked })} />
                        Compare with the previous month
                      </label>
                      <label className="block">
                        <Label>Target (optional)</Label>
                        <input type="number" min={0} className={inputCls} value={draft.target} placeholder="e.g. 100" onChange={(e) => set({ target: e.target.value })} />
                      </label>
                    </>
                  )}

                  {type === 'funnel' && (
                    <>
                      <label className="block">
                        <Label>Funnel</Label>
                        <select className={inputCls} value={draft.funnel.kind} onChange={(e) => set({ funnel: { ...draft.funnel, kind: e.target.value, field: draft.funnel.field || enumFields[0]?.key || '' } })}>
                          {(source.funnels || []).includes('stage') && <option value="stage">Pipeline stages (reached)</option>}
                          {(source.funnels || []).includes('activity') && <option value="activity">Activities done (visit → demo → …)</option>}
                          {enumFields.length > 0 && <option value="enum">Count per choice field</option>}
                        </select>
                      </label>
                      {draft.funnel.kind === 'enum' && (
                        <label className="block">
                          <Label>Field</Label>
                          <select className={inputCls} value={draft.funnel.field} onChange={(e) => set({ funnel: { ...draft.funnel, field: e.target.value } })}>
                            {enumFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                        </label>
                      )}
                    </>
                  )}

                  {type === 'table' && !grouped && (
                    <>
                      <div className="sm:col-span-2">
                        <Label>Columns (in this order)</Label>
                        <div className="flex flex-wrap gap-1">
                          {cols.map((f) => {
                            const at = draft.table.columns.indexOf(f.key);
                            return (
                              <button key={f.key} type="button"
                                onClick={() => set({ table: { ...draft.table, columns: at >= 0 ? draft.table.columns.filter((k) => k !== f.key) : [...draft.table.columns, f.key] } })}
                                className={`rounded-md border px-2 py-1 text-xs ${at >= 0 ? 'border-violet-400 bg-violet-50 text-violet-800 font-semibold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                {at >= 0 ? `${at + 1}. ` : ''}{f.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <label className="block">
                        <Label>Sort by</Label>
                        <select className={inputCls} value={draft.table.sortField} onChange={(e) => set({ table: { ...draft.table, sortField: e.target.value } })}>
                          <option value="">Automatic (first date column)</option>
                          {draft.table.columns.map((k) => <option key={k} value={k}>{fieldOf(source, k)?.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <Label>Order</Label>
                        <select className={inputCls} value={draft.table.sortDir} onChange={(e) => set({ table: { ...draft.table, sortDir: e.target.value } })}>
                          <option value="desc">Newest / largest first</option>
                          <option value="asc">Oldest / smallest first</option>
                        </select>
                      </label>
                      <label className="block">
                        <Label>Rows per page</Label>
                        <select className={inputCls} value={draft.table.pageSize} onChange={(e) => set({ table: { ...draft.table, pageSize: Number(e.target.value) } })}>
                          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              </Section>
            )}
          </div>

          {/* Preview */}
          <div className="lg:flex-1 lg:border-l border-violet-100 p-3 sm:p-4 order-1 lg:order-2 flex flex-col">
            <div className="glass-card p-4 flex-1 flex flex-col min-h-[340px]">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{draft.title || 'Untitled widget'}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {source.label} · {chart.label}
                    {preview.result?.dateField ? ` · ${preview.result.dateField.label}: ${formatRange(preview.result.range)}` : ''}
                  </p>
                </div>
                {preview.loading && <Spinner size="sm" />}
              </div>
              <div className={`flex-1 min-h-0 ${preview.loading ? 'opacity-60' : ''} transition-opacity`}>
                {preview.error ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
                    <AlertCircle className="text-amber-500" />
                    <p className="text-sm text-gray-700">{preview.error.message}</p>
                    <p className="text-xs text-gray-400">Adjust the settings on the left.</p>
                  </div>
                ) : preview.result ? (
                  <ChartRenderer result={preview.result} onPage={setPage} />
                ) : (
                  <div className="h-full flex items-center justify-center"><Spinner /></div>
                )}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Live preview with {catalog.scope === 'all' ? 'all data' : "your department's data"}. Only you can see this widget.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
