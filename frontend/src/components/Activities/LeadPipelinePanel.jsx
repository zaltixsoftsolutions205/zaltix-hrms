import { Trophy, XCircle } from 'lucide-react';
import {
  PIPELINE_STAGES, TERMINAL_STAGES, normalizeStage, stageLabel,
} from '../../hooks/useGlobalTableColumns';
import LeadActivitySection from './LeadActivitySection';
import { ACTIVITY_ORDER } from './activityTypes';
import { canEditStage } from './pipelineAccess';

/**
 * Every pipeline stage of a lead as a vertical timeline (lead page and lead drawer).
 * Only for admin / HR / managers (pipelineAccess.canSeePipeline); `editable` when
 * they may also add and change entries (canEditPipeline), per stage only with
 * edit on that stage's page module (canEditStage).
 */
export default function LeadPipelinePanel({
  leadId, stage, wonActivityStage = null, userLookup, reloadKey, editable, currentUser, onLeadChanged, types = ACTIVITY_ORDER,
}) {
  const current = normalizeStage(stage);
  // The stage whose entries can be added now: the open stage, or the page a client was sent to.
  const activeType = current === 'lead-won' ? wonActivityStage : current === 'lead-lost' ? null : current;
  const index = PIPELINE_STAGES.indexOf(current);
  // A won / lost lead may have passed any stage.
  const reached = (type) => TERMINAL_STAGES.includes(current) || PIPELINE_STAGES.indexOf(type) <= index;

  return (
    <div>
      {current === 'lead-won' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700">
          <Trophy size={14} />
          {wonActivityStage
            ? <>Lead Won: this client is in {stageLabel(wonActivityStage)} (sent from CRM › Clients). New {stageLabel(wonActivityStage)} entries can be added.</>
            : <>Lead Won: this lead is a client. Send it to an activity from CRM › Clients to add new entries.</>}
        </p>
      )}
      {current === 'lead-lost' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs font-semibold text-red-700">
          <XCircle size={14} /> Lead Lost: entries are read-only. Rework the lead from CRM › Clients › Lost Clients to change them.
        </p>
      )}
      <ol aria-label="Pipeline stages">
        {types.map((type, i) => (
          <LeadActivitySection
            key={type}
            type={type}
            step={i + 1}
            last={i === types.length - 1}
            leadId={leadId}
            userLookup={userLookup}
            reloadKey={reloadKey}
            current={activeType === type}
            reached={reached(type)}
            editable={editable && canEditStage(currentUser, type)}
            currentUser={currentUser}
            onLeadChanged={onLeadChanged}
          />
        ))}
      </ol>
    </div>
  );
}
