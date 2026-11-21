import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, X, Loader2, Send, Trash2, MessageSquare, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import { errMsg, fileUrl, initials } from './workUtils';

const MAX_FILES = 4;
const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
const fileName = (p) => decodeURIComponent(String(p).split('/').pop() || 'file');

/**
 * Attachments + comment thread for an existing work item.
 *   canEditFiles   the caller may add / remove files (full or assignee scope)
 *   canModerate    the caller may delete anyone's comment (full scope)
 */
const WorkItemActivity = ({ projectId, item, userId, canEditFiles, canModerate, onAttachmentsChange }) => {
  const base = `/projects/${projectId}/work/items/${item._id}`;
  const [attachments, setAttachments] = useState(item.attachments || []);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => { setAttachments(item.attachments || []); }, [item._id, item.attachments]);

  const loadComments = useCallback(async () => {
    try {
      setLoadingComments(true);
      const res = await api.get(`${base}/comments`);
      setComments(res.data.comments || []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not load comments'));
    } finally {
      setLoadingComments(false);
    }
  }, [base]);
  useEffect(() => { loadComments(); }, [loadComments]);

  const updateFiles = (next) => { setAttachments(next); onAttachmentsChange?.(next); };

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    if (attachments.length + files.length > MAX_FILES) {
      toast.error(`An item can have at most ${MAX_FILES} files.`);
      return;
    }
    const form = new FormData();
    files.forEach((f) => form.append('attachments', f));
    try {
      setUploading(true);
      const res = await api.post(`${base}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateFiles(res.data.attachments || []);
      toast.success(files.length > 1 ? 'Files added' : 'File added');
    } catch (err) {
      toast.error(errMsg(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (path) => {
    try {
      const res = await api.delete(`${base}/attachments`, { data: { path } });
      updateFiles(res.data.attachments || []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not remove the file'));
    }
  };

  const post = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    try {
      setPosting(true);
      const res = await api.post(`${base}/comments`, { body });
      setComments((list) => [...list, res.data.comment]);
      setDraft('');
    } catch (err) {
      toast.error(errMsg(err, 'Could not post the comment'));
    } finally {
      setPosting(false);
    }
  };

  const removeComment = async (id) => {
    try {
      await api.delete(`${base}/comments/${id}`);
      setComments((list) => list.filter((c) => c._id !== id));
    } catch (err) {
      toast.error(errMsg(err, 'Could not delete the comment'));
    }
  };

  const labelCls = 'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2';

  return (
    <div className="space-y-5 border-t border-gray-100 pt-4">
      {/* Attachments */}
      <section aria-label="Attachments">
        <div className="flex items-center justify-between">
          <p className={labelCls}><Paperclip className="w-3.5 h-3.5" /> Files · {attachments.length}/{MAX_FILES}</p>
          {canEditFiles && attachments.length < MAX_FILES && (
            <>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={upload} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline disabled:opacity-50">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} Attach
              </button>
            </>
          )}
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-gray-400">No files.</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                <a href={fileUrl(a)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 min-w-0 text-xs text-violet-700 hover:underline">
                  <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{fileName(a)}</span>
                </a>
                {canEditFiles && (
                  <button type="button" onClick={() => removeFile(a)} className="text-gray-300 hover:text-rose-600" aria-label={`Remove ${fileName(a)}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Comments */}
      <section aria-label="Comments">
        <p className={labelCls}><MessageSquare className="w-3.5 h-3.5" /> Comments · {comments.length}</p>
        {loadingComments ? (
          <div className="py-3 flex justify-center text-violet-400"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-gray-400 mb-2">No comments yet.</p>
        ) : (
          <ul className="space-y-3 mb-3 max-h-64 overflow-y-auto pr-1">
            {comments.map((c) => {
              const mine = String(c.author?._id) === String(userId);
              return (
                <li key={c._id} className="flex gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {initials(c.author?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">{c.author?.name || 'Someone'}</span>
                      <span className="text-[10px] text-gray-400">{timeAgo(c.createdAt)}</span>
                      {(mine || canModerate) && (
                        <button type="button" onClick={() => removeComment(c._id)} className="ml-auto text-gray-300 hover:text-rose-600" aria-label="Delete comment">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {/* Not a nested <form>: this sits inside the item dialog's form. */}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(e); }}
            rows={2}
            maxLength={4000}
            placeholder="Write a comment… (Ctrl+Enter to send)"
            aria-label="Write a comment"
            className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
          />
          <button type="button" onClick={post} disabled={posting || !draft.trim()}
            className="self-end inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
            aria-label="Post comment">
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </section>
    </div>
  );
};

export default WorkItemActivity;
