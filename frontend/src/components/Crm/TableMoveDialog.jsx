import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '../../utils/api';
import Modal from '../UI/Modal';

/**
 * Move a Mandal table (with all its leads, columns and values) to another
 * Mandal of the same product. The preview says how many leads move and which
 * of them are assigned to people who would lose access; those must be handed
 * to someone who works in the target Mandal before the move is allowed.
 *
 * mandals: [{ _id, label }] — Mandals of this product except the current one.
 */
export default function TableMoveDialog({ productId, fromLocationId, table, mandals, onClose, onMoved }) {
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reassignTo, setReassignTo] = useState('');
  const [moving, setMoving] = useState(false);

  const base = `/products/${productId}/locations/${fromLocationId}/tables/${table._id}`;

  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    setReassignTo('');
    if (!target) return undefined;
    let active = true;
    setLoadingPreview(true);
    api.get(`${base}/move-preview`, { params: { target } })
      .then(({ data }) => { if (active) setPreview(data); })
      .catch((err) => { if (active) setPreviewError(err.response?.data?.message || 'Cannot move the table there'); })
      .finally(() => { if (active) setLoadingPreview(false); });
    return () => { active = false; };
  }, [base, target]);

  const needsReassign = (preview?.affectedCount || 0) > 0;
  const canMove = preview && !previewError && (!needsReassign || reassignTo) && !moving;

  const move = async () => {
    setMoving(true);
    try {
      const { data } = await api.post(`${base}/move`, { targetLocationId: target, reassignTo: needsReassign ? reassignTo : undefined });
      toast.success(`Moved "${table.name}" to ${preview.target.name}: ${data.movedLeads} lead${data.movedLeads !== 1 ? 's' : ''}${data.reassigned ? `, ${data.reassigned} reassigned` : ''}`);
      onMoved?.(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to move the table');
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal isOpen onClose={moving ? () => {} : onClose} title={`Move "${table.name}"`} size="md">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          The table moves with all its leads, columns and values. Product, Address and Mandal of every lead
          change to the new Mandal.
        </p>

        <div>
          <label className="label-text" htmlFor="move-target">Move to Mandal</label>
          <select id="move-target" className="input-field" value={target} onChange={(e) => setTarget(e.target.value)} disabled={moving}>
            <option value="">Select a Mandal</option>
            {mandals.map((m) => <option key={m._id} value={m._id}>{m.label}</option>)}
          </select>
          {!mandals.length && <p className="mt-1 text-xs text-gray-400">This product has no other Mandal.</p>}
        </div>

        {loadingPreview && (
          <p className="flex items-center gap-2 text-xs text-violet-500"><Loader2 size={14} className="animate-spin" /> Checking…</p>
        )}
        {previewError && <p role="alert" className="text-xs text-red-600">{previewError}</p>}

        {preview && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-3 text-sm">
            <p className="text-violet-900">
              <strong>{preview.leadCount}</strong> lead{preview.leadCount !== 1 ? 's' : ''} will move to <strong>{preview.target.name}</strong>.
            </p>
            {needsReassign ? (
              <div className="space-y-2">
                <p className="text-amber-700 text-xs">
                  {preview.affectedCount} lead{preview.affectedCount !== 1 ? 's are' : ' is'} assigned to{' '}
                  {preview.affectedAssignees.map((u) => `${u.name} (${u.employeeId})`).join(', ')}, who
                  {preview.affectedAssignees.length === 1 ? ' does' : ' do'} not work in {preview.target.name}. Choose who takes them over:
                </p>
                <select className="input-field" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} disabled={moving} aria-label="New assignee">
                  <option value="">Select a person</option>
                  {preview.candidates.map((u) => (
                    <option key={u._id} value={u._id}>{u.name} ({u.employeeId}) · {u.role}</option>
                  ))}
                </select>
                {!preview.candidates.length && <p className="text-xs text-red-600">Nobody is assigned to this Mandal yet; assign an employee to it first.</p>}
              </div>
            ) : (
              <p className="text-xs text-green-700">Everyone holding these leads keeps access in {preview.target.name}.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={moving}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={move} disabled={!canMove}>
            {moving ? 'Moving…' : 'Move table'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
