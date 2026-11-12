import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, ExternalLink, Loader2, Plus } from 'lucide-react';
import { getPage } from './activityTypes';
import ActivityCards from './ActivityCards';
import ActivityFormModal from './ActivityFormModal';
import ConfirmDialog from '../GlobalTable/ConfirmDialog';
import { updateLeadStage } from '../../services/ActivityService';
import { stageLabel } from '../../hooks/useGlobalTableColumns';

const PAGE_PATHS = {
  visit: '/sale/visit',
  demo: '/sale/demos',
  'data-update': '/sale/dataupdation',
  registration: '/sale/registration',
  feedback: '/sale/feedback',
};

const STATUS = {
  current: { text: 'Current stage', chip: 'bg-violet-600 text-white', dot: 'bg-violet-600 border-violet-600 text-white ring-4 ring-violet-100' },
  done: { text: 'Done', chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500 border-emerald-500 text-white' },
  passed: { text: 'Passed', chip: 'bg-gray-100 text-gray-500', dot: 'bg-white border-gray-300 text-gray-400' },
  upcoming: { text: 'Not reached', chip: 'bg-gray-100 text-gray-400', dot: 'bg-white border-gray-200 text-gray-300' },
};

/**
 * One pipeline stage of a lead (visits, demos, data update, registration, feedback)
 * on the lead page and in the lead drawer, as a step of a vertical timeline.
 *   editable  admin / HR / a manager with CRM edit: add entries (while the lead is
 *             in this stage, the backend's rule), open an entry to edit or delete it
 *   otherwise entries open read-only
 * `current`: the lead is in this stage; `reached`: it has got to it.
 * onLeadChanged: an entry or the stage changed something on the lead (follow-up
 * date, stage); the parent reloads the lead and every section.
 */
export default function LeadActivitySection({
  type, leadId, userLookup, reloadKey, reached = true, current = false, step, last = false,
  editable = false, currentUser, onLeadChanged,
}) {
  const page = getPage(type);
  const [state, setState] = useState({ loading: true, detail: null, failed: false });
  const [ownKey, setOwnKey] = useState(0);
  const [form, setForm] = useState(null); // { entry: null | entry }
  const [winPrompt, setWinPrompt] = useState(false);
  const [winBusy, setWinBusy] = useState(false);

  useEffect(() => {
    if (!leadId) return undefined;
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    page.api.getDetail(leadId)
      .then((detail) => { if (active) setState({ loading: false, detail, failed: false }); })
      .catch(() => { if (active) setState({ loading: false, detail: null, failed: true }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, reloadKey, ownKey, type]);

  const { loading, detail, failed } = state;
  const entries = detail?.entries || [];
  const count = entries.length;
  const status = current ? 'current' : count > 0 ? 'done' : reached ? 'passed' : 'upcoming';
  const tone = STATUS[status];
  const canAdd = editable && Boolean(detail?.canAdd);

  const afterSave = (_saved, { isNew } = {}) => {
    setForm(null);
    if (onLeadChanged) onLeadChanged(); else setOwnKey((k) => k + 1);
    // A new registration: offer to make the lead a customer (Lead Won is final).
    if (isNew && page.wins) setWinPrompt(true);
  };

  const markWon = async () => {
    if (!detail || winBusy) return;
    setWinBusy(true);
    try {
      await updateLeadStage(leadId, 'lead-won', detail.lead.pipelineStage);
      toast.success(`${detail.lead.name} is now ${stageLabel('lead-won')}`);
      setWinPrompt(false);
      onLeadChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWinBusy(false);
    }
  };

  let body;
  if (loading && !detail) {
    body = <p className="flex items-center gap-1.5 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading…</p>;
  } else if (failed) {
    body = <p className="text-xs text-gray-400">Could not load the {page.title.toLowerCase()}.</p>;
  } else if (count === 0) {
    body = canAdd ? (
      <button type="button" onClick={() => setForm({ entry: null })} className="w-full !justify-start gap-2 rounded-xl border-2 border-dashed border-violet-200 px-3 py-3 text-xs font-semibold text-violet-600 hover:bg-violet-50 hover:border-violet-400">
        <Plus size={14} /> The lead is in this stage. Record its first {page.noun}.
      </button>
    ) : (
      <p className="text-xs text-gray-400">
        {reached ? `No ${page.noun} recorded.` : 'The lead has not reached this stage yet.'}
        {editable && !current && ` Move the lead to the ${page.label} stage to add one.`}
      </p>
    );
  } else {
    body = (
      <>
        <ActivityCards
          detail={detail}
          page={page}
          userLookup={userLookup}
          readOnly
          showAll
          onOpen={(entry) => setForm({ entry })}
        />
        {editable && !current && (
          <p className="mt-1 text-[11px] text-gray-400">Click an entry to edit it. New entries can be added while the lead is in the {page.label} stage.</p>
        )}
      </>
    );
  }

  const addVisible = canAdd && !(page.single && count > 0);

  return (
    <li id={`stage-${type}`} aria-label={page.title} className="relative pl-10 scroll-mt-4">
      {!last && <span aria-hidden className={`absolute left-[13px] top-8 bottom-0 w-0.5 ${status === 'upcoming' ? 'bg-gray-100' : 'bg-violet-100'}`} />}
      <span aria-hidden className={`absolute left-0 top-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${tone.dot}`}>
        {status === 'done' ? <Check size={14} /> : step}
      </span>

      <div className="pb-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[28px]">
          <h4 className={`font-bold text-sm ${status === 'upcoming' ? 'text-gray-400' : 'text-gray-900'}`}>{page.title}</h4>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>{tone.text}</span>
          {count > 0 && <span className="rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[10px] font-semibold">{count} {count === 1 ? 'entry' : 'entries'}</span>}
          <span className="ml-auto flex items-center gap-1">
            {addVisible && (
              <button type="button" onClick={() => setForm({ entry: null })} className="gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700">
                <Plus size={12} /> Add {page.noun}
              </button>
            )}
            <Link to={`${PAGE_PATHS[type]}?lead=${leadId}`} title={`Open this lead on the ${page.title} page`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-violet-600 hover:bg-violet-50">
              <ExternalLink size={12} /> {page.title}
            </Link>
          </span>
        </div>
        <div className="mt-2">{body}</div>
      </div>

      {/* Portals: the lead drawer is transformed, which would trap a fixed dialog inside it. */}
      {form && detail && createPortal(
        <ActivityFormModal
          key={form.entry?._id || 'new'}
          page={page}
          detail={detail}
          entry={form.entry}
          viewOnly={!editable}
          currentUser={currentUser}
          onClose={() => setForm(null)}
          onSaved={afterSave}
          onDeleted={() => afterSave(null)}
        />,
        document.body,
      )}

      {winPrompt && detail && createPortal(
        <ConfirmDialog
          title="Mark this lead as Lead Won?"
          confirmLabel="Mark Lead Won"
          busy={winBusy}
          onConfirm={markWon}
          onCancel={() => setWinPrompt(false)}
        >
          <p>
            The registration for <strong>{detail.lead.name}</strong> is saved. Mark the lead as a customer
            (<strong>{stageLabel('lead-won')}</strong>)? Lead Won is final: the stage cannot be changed afterwards.
            Choose Cancel to keep it in {page.label}.
          </p>
        </ConfirmDialog>,
        document.body,
      )}
    </li>
  );
}

export { PAGE_PATHS };
