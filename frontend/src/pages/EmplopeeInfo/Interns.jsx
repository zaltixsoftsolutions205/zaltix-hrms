import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Ico, Field, SelectField } from '../../components/UI/FromPrimitives';
import ModuleAccessPicker from '../../components/UI/ModuleAccessPicker';
import { useNavigate } from "react-router-dom";
/* ------------------------------------------------------------------ */
/*  Internship-specific constants                                      */
/* ------------------------------------------------------------------ */

const STATUS_COLORS = {
    active: 'bg-violet-100 text-violet-700 border border-violet-200',
    completed: 'bg-orange-100 text-orange-700 border border-orange-200',
    accepted: 'bg-green-100 text-green-700 border border-green-200',
    rejected: 'bg-gray-100 text-gray-900 border border-gray-200',
    extended: 'bg-blue-100 text-blue-700 border border-blue-200',
};

const STATUS_LABELS = {
    active: 'Active',
    completed: 'Completed',
    accepted: 'Accepted',
    rejected: 'Rejected',
    extended: 'Extended',
};

/* ------------------------------------------------------------------ */
/*  Internship-specific helpers                                        */
/* ------------------------------------------------------------------ */

function formatDate(dateInput) {
    if (!dateInput) return '—';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name = '') {
    return (
        name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join('') || '?'
    );
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getDaysRemaining(endDate) {
    if (!endDate) return null;
    return Math.round((startOfDay(endDate) - startOfDay(new Date())) / 86400000);
}

function getDaysLeftInfo(endDate) {
    const diffDays = getDaysRemaining(endDate);
    if (diffDays === null) return null;
    if (diffDays > 0) return { label: `${diffDays} day${diffDays === 1 ? '' : 's'} left`, className: 'bg-violet-100 text-violet-700' };
    if (diffDays === 0) return { label: 'Ends Today', className: 'bg-orange-100 text-orange-700' };
    return { label: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`, className: 'bg-gray-200 text-gray-900' };
}

// Client-side derived status: the DB keeps storing 'active'/'extended' until
// HR actually acts on it — this decides what the UI shows. Once the end
// date has passed, an active/extended internship visually becomes
// 'completed' and waits for a decision (Accept / Reject / Extend).
function getDisplayStatus(intern) {
    const status = intern.internship?.status;
    if (status === 'accepted' || status === 'rejected') return status;
    const daysRemaining = getDaysRemaining(intern.internship?.endDate);
    if (daysRemaining !== null && daysRemaining <= 0 && (status === 'active' || status === 'extended')) {
        return 'completed';
    }
    return status;
}

/* ------------------------------------------------------------------ */
/*  Small presentational pieces                                        */
/* ------------------------------------------------------------------ */

function Avatar({ name }) {
    return (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
            {getInitials(name)}
        </div>
    );
}

function StatusChip({ status }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
            {STATUS_LABELS[status] || status || '—'}
        </span>
    );
}

function SummaryCard({ d, label, value, accent }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white p-3.5 shadow-sm">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${accent}`}>
                <Ico d={d} className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-xs font-medium text-violet-500">{label}</p>
                <p className="text-lg font-bold text-violet-900">{value}</p>
            </div>
        </div>
    );
}

function ModalShell({ title, onClose, children, wide }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
            <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-5 shadow-lg`}>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-bold text-violet-900">{title}</h3>
                    <button onClick={onClose} className="rounded-lg p-1 text-violet-400 hover:bg-violet-50 hover:text-violet-700">
                        <Ico d="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  View modal                                                          */
/* ------------------------------------------------------------------ */

function ViewModal({ intern, onClose }) {
    return (
        <ModalShell title="Internship Details" onClose={onClose}>
            <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                    <Avatar name={intern.name} />
                    <div>
                        <p className="font-semibold text-violet-900">{intern.name}</p>
                        <p className="text-xs text-violet-500">{intern.employeeId} · {intern.email}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-violet-100">
                    <div>
                        <p className="text-xs text-violet-500">Department</p>
                        <p className="font-medium text-violet-800">{intern.department?.name || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-violet-500">Designation</p>
                        <p className="font-medium text-violet-800">{intern.designation || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-violet-500">Start Date</p>
                        <p className="font-medium text-violet-800">{formatDate(intern.internship?.startDate)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-violet-500">End Date</p>
                        <p className="font-medium text-violet-800">{formatDate(intern.internship?.endDate)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-violet-500">Duration</p>
                        <p className="font-medium text-violet-800">{intern.internship?.durationMonths ? `${intern.internship.durationMonths} mo` : '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-violet-500">Status</p>
                        <StatusChip status={getDisplayStatus(intern)} />
                    </div>
                </div>
            </div>
            <div className="flex justify-end pt-4">
                <button onClick={onClose} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Close</button>
            </div>
        </ModalShell>
    );
}

/* ------------------------------------------------------------------ */
/*  Internship action modals                                           */
/* ------------------------------------------------------------------ */

function AcceptModal({ intern, onClose, onConfirm, busy }) {
    const [employeeId, setEmployeeId] = useState(intern.employeeId || '');

    return (
        <ModalShell title="Convert to full-time employee" onClose={onClose}>
            <p className="mb-3 text-sm text-violet-600">
                <span className="font-semibold text-violet-900">{intern.name}</span> will be converted from
                intern to a full-time employee. Attendance, leave, and payslip history are kept.
            </p>
            <div className="mb-5">
                <label className="block text-xs font-semibold text-violet-700 mb-1">Employee ID</label>
                <input
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Employee ID"
                />
                <p className="mt-1 text-[11px] text-violet-400">Update this if the intern needs a new full-time Employee ID.</p>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">
                    Cancel
                </button>
                <button
                    onClick={() => onConfirm(employeeId.trim())}
                    disabled={busy || !employeeId.trim()}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                    {busy ? 'Converting…' : 'Confirm & Convert'}
                </button>
            </div>
        </ModalShell>
    );
}

function RejectModal({ intern, onClose, onConfirm, busy }) {
    const [reason, setReason] = useState('');
    return (
        <ModalShell title="Reject internship" onClose={onClose}>
            <p className="mb-3 text-sm text-violet-600">
                Provide a reason for rejecting <span className="font-semibold text-violet-900">{intern.name}</span>.
                The employee record is kept but marked inactive.
            </p>
            <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason for rejection…"
                className="mb-5 w-full resize-none rounded-xl border border-violet-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">
                    Cancel
                </button>
                <button
                    onClick={() => onConfirm(reason.trim())}
                    disabled={busy || !reason.trim()}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                    {busy ? 'Rejecting…' : 'Reject Internship'}
                </button>
            </div>
        </ModalShell>
    );
}
function ExtendModal({ intern, onClose, onConfirm, busy }) {
    const [months, setMonths] = useState(1);
    const [customDate, setCustomDate] = useState('');
    const isCustom = months === 'custom';

    const newEndDate = useMemo(() => {
        if (isCustom) {
            if (!customDate) return null;
            const d = new Date(customDate);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        if (!months || months <= 0) return null;
        const base = new Date(intern.internship?.endDate || Date.now());
        base.setMonth(base.getMonth() + Number(months));
        return base;
    }, [isCustom, customDate, months, intern.internship?.endDate]);

    // Minimum selectable custom date = current internship end date (or today, whichever is later)
    const minDate = useMemo(() => {
        const current = intern.internship?.endDate ? new Date(intern.internship.endDate) : new Date();
        return current.toISOString().slice(0, 10);
    }, [intern.internship?.endDate]);

    return (
        <ModalShell title="Extend internship" onClose={onClose}>
            <p className="mb-3 text-sm text-violet-600">
                Extend the internship for <span className="font-semibold text-violet-900">{intern.name}</span>.
            </p>
            <div className="mb-4 grid grid-cols-4 gap-2">
                {[1, 2, 3].map((m) => (
                    <button
                        key={m}
                        onClick={() => setMonths(m)}
                        className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${months === m ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 text-violet-700 hover:bg-violet-50'}`}
                    >
                        {m}mo
                    </button>
                ))}
                <button
                    onClick={() => setMonths('custom')}
                    className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${isCustom ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 text-violet-700 hover:bg-violet-50'}`}
                >
                    Custom
                </button>
            </div>
            {isCustom && (
                <div className="mb-4">
                    <label className="block text-xs font-semibold text-violet-700 mb-1">New End Date</label>
                    <input
                        type="date"
                        min={minDate}
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full rounded-xl border border-violet-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                </div>
            )}
            {newEndDate && (
                <div className="mb-5 rounded-xl bg-blue-50 p-3 text-sm">
                    <p className="text-violet-500">New end date</p>
                    <p className="font-bold text-blue-700">{formatDate(newEndDate)}</p>
                </div>
            )}
            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">
                    Cancel
                </button>
                <button
                    onClick={() => onConfirm(newEndDate)}
                    disabled={busy || !newEndDate}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {busy ? 'Extending…' : 'Extend Internship'}
                </button>
            </div>
        </ModalShell>
    );
}

/* ------------------------------------------------------------------ */
/*  Add Intern modal                                                    */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Add Intern Modal                                                  */
/* ------------------------------------------------------------------ */
function AddInternModal({
    onClose,
    internForm,
    setInternForm,
    handleCreateIntern,
    loading,
    departments,
}) {
    useEffect(() => {
        setInternForm((p) =>
            p.employeeType === "intern"
                ? p
                : { ...p, employeeType: "intern" }
        );
    }, [setInternForm]);

    const [durationOption, setDurationOption] = useState(1);
    const [customMonths, setCustomMonths] = useState("");

    const isCustom = durationOption === "custom";
    const finalMonths = isCustom ? Number(customMonths) : durationOption;

    const computedEndDate = useMemo(() => {
        if (!internForm.joiningDate || !finalMonths || finalMonths <= 0)
            return null;

        const base = new Date(internForm.joiningDate);

        if (Number.isNaN(base.getTime())) return null;

        base.setMonth(base.getMonth() + Number(finalMonths));

        return base;
    }, [internForm.joiningDate, finalMonths]);

    useEffect(() => {
        setInternForm((p) => ({
            ...p,
            internshipDurationMonths: finalMonths || "",
            internshipEndDate: computedEndDate
                ? computedEndDate.toISOString().slice(0, 10)
                : "",
        }));
    }, [computedEndDate, finalMonths, setInternForm]);

    const f = (key) => (e) =>
        setInternForm((p) => ({
            ...p,
            [key]: e.target.value,
        }));

    const submit = (e) => {
        e.preventDefault();
        handleCreateIntern(e);
    };

    return (
        <ModalShell title="Add Intern" onClose={onClose} wide>
            <form onSubmit={submit} className="space-y-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label="Employee ID"
                        value={internForm.employeeId}
                        onChange={f("employeeId")}
                        placeholder="Auto or manual ID"
                    />

                    <Field
                        label="Name"
                        required
                        value={internForm.name}
                        onChange={f("name")}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label="Email *"
                        type="email"
                        required
                        value={internForm.email}
                        onChange={f("email")}
                        placeholder="Login email"
                    />

                    <Field
                        label="Phone"
                        value={internForm.phone}
                        onChange={f("phone")}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SelectField
                        label="Department"
                        value={internForm.departmentId}
                        onChange={f("departmentId")}
                    >
                        <option value="">None</option>

                        {departments.map((d) => (
                            <option key={d._id} value={d._id}>
                                {d.name}
                            </option>
                        ))}
                    </SelectField>

                    <Field
                        label="Designation"
                        value={internForm.designation}
                        onChange={f("designation")}
                        placeholder="e.g. SDE Intern"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label="Joining Date"
                        type="date"
                        value={internForm.joiningDate}
                        onChange={f("joiningDate")}
                    />

                    <Field
                        label="Basic Salary / Stipend (₹)"
                        type="number"
                        value={internForm.basicSalary}
                        onChange={f("basicSalary")}
                    />
                </div>

                {/* Candidate Type */}

                <div className="border-t border-violet-100 pt-3">
                    <label className="mb-2 block text-xs font-semibold text-violet-700">
                        Candidate Type
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                        {["fresher", "experienced"].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() =>
                                    setInternForm((p) => ({
                                        ...p,
                                        internCandidateType: t,
                                    }))
                                }
                                className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition-colors ${(internForm.internCandidateType ||
                                        "fresher") === t
                                        ? "border-violet-600 bg-violet-600 text-white"
                                        : "border-violet-200 text-violet-700 hover:bg-violet-50"
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Internship Duration */}

                <div className="border-t border-violet-100 pt-3">
                    <label className="mb-2 block text-xs font-semibold text-violet-700">
                        Internship Duration
                    </label>

                    <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3].map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setDurationOption(m)}
                                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${durationOption === m
                                        ? "border-violet-600 bg-violet-600 text-white"
                                        : "border-violet-200 text-violet-700 hover:bg-violet-50"
                                    }`}
                            >
                                {m}mo
                            </button>
                        ))}

                        <button
                            type="button"
                            onClick={() => setDurationOption("custom")}
                            className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${isCustom
                                    ? "border-violet-600 bg-violet-600 text-white"
                                    : "border-violet-200 text-violet-700 hover:bg-violet-50"
                                }`}
                        >
                            Custom
                        </button>
                    </div>

                    {isCustom && (
                        <input
                            type="number"
                            min={1}
                            value={customMonths}
                            onChange={(e) =>
                                setCustomMonths(e.target.value)
                            }
                            placeholder="Number of months"
                            className="mt-3 w-full rounded-xl border border-violet-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                    )}

                    {computedEndDate ? (
                        <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm">
                            <p className="text-violet-500">
                                Internship End Date
                            </p>

                            <p className="font-bold text-blue-700">
                                {formatDate(computedEndDate)}
                            </p>
                        </div>
                    ) : (
                        <p className="mt-2 text-xs text-violet-400">
                            Select a joining date to calculate the end date.
                        </p>
                    )}
                </div>

                {/* Module Access */}

                <div className="border-t border-violet-100 pt-3">
                    <ModuleAccessPicker
                        value={internForm.moduleAccess}
                        onChange={(ma) =>
                            setInternForm((p) => ({
                                ...p,
                                moduleAccess: ma,
                            }))
                        }
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
                    >
                        {loading ? "Creating..." : "Create Intern"}
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-sm font-semibold transition-colors"
                    >
                        Cancel
                    </button>
                </div>

            </form>
        </ModalShell>
    );
}
/* ------------------------------------------------------------------ */
/*  Row actions                                                         */
/* ------------------------------------------------------------------ */

function InternActions({ intern, onView, onDrop, onAccept, onReject, onExtend, onConvert }) {
    const displayStatus = getDisplayStatus(intern);

    if (displayStatus === 'rejected') {
        return <span className="text-xs text-violet-400">—</span>;
    }

    if (displayStatus === 'accepted') {
        const converted = intern.employeeType !== 'intern';
        return (
            <button
                onClick={() => onConvert(intern)}
                disabled={converted}
                className="rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-200 disabled:text-violet-500 px-2.5 py-1.5 text-xs font-semibold"
            >
                {converted ? 'Converted' : 'Convert to Full-Time'}
            </button>
        );
    }

    // End date reached -> decision point
    if (displayStatus === 'completed') {
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => onAccept(intern)} className="rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 px-2.5 py-1.5 text-xs font-semibold">Accept</button>
                <button onClick={() => onReject(intern)} className="rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 px-2.5 py-1.5 text-xs font-semibold">Reject</button>
                <button onClick={() => onExtend(intern)} className="rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 px-2.5 py-1.5 text-xs font-semibold">Extend</button>
            </div>
        );
    }

    // status is 'active' or 'extended' and days remaining > 0 -> still ongoing
    return (
        <div className="flex items-center gap-1.5">
            <button onClick={() => onView(intern)} className="rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 px-2.5 py-1.5 text-xs font-semibold">View</button>
            <button onClick={() => onDrop(intern)} className="rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 px-2.5 py-1.5 text-xs font-semibold">Drop</button>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export default function Interns({
    interns = [],
    departments = [],
    internForm,
    setInternForm,
    handleCreateIntern,
    loading = false,
    fetchAll,
    showAddIntern,
    setshowAddIntern,
}) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [modal, setModal] = useState(null); // { type: 'view'|'accept'|'reject'|'extend', intern }
    const [actionLoading, setActionLoading] = useState(false);

    const filteredInterns = useMemo(() => {
        const q = search.trim().toLowerCase();
        return interns.filter((i) => {
            const matchesSearch =
                !q || i.name?.toLowerCase().includes(q) || (i.employeeId || '').toLowerCase().includes(q) || i.email?.toLowerCase().includes(q);
            const matchesStatus = !statusFilter || getDisplayStatus(i) === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [interns, search, statusFilter]);

    const summary = useMemo(() => {
        const active = interns.filter((i) => ['active', 'extended'].includes(getDisplayStatus(i))).length;
        const completed = interns.filter((i) => getDisplayStatus(i) === 'completed').length;
        const accepted = interns.filter((i) => getDisplayStatus(i) === 'accepted').length;
        return { total: interns.length, active, completed, awaiting: completed, accepted };
    }, [interns]);

    const closeModal = () => setModal(null);

    const navigate = useNavigate();

    const acceptIntern = async (newEmployeeId) => {
        if (!modal?.intern) return;
        setActionLoading(true);
        try {
            await api.patch(`/employees/${modal.intern._id}/internship`, {
                convertToFullTime: true,
                status: 'accepted',
                employeeId: newEmployeeId,
            });
            toast.success('Intern converted to full-time employee');
            closeModal();
            fetchAll?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to convert intern');
        } finally {
            setActionLoading(false);
        }
    };

    const rejectIntern = async (reason) => {
        if (!modal?.intern) return;
        setActionLoading(true);
        try {
            await api.patch(`/employees/${modal.intern._id}/internship`, { status: 'rejected', reason });
            toast.success('Internship marked as rejected');
            closeModal();
            fetchAll?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject internship');
        } finally {
            setActionLoading(false);
        }
    };

    const extendIntern = async (newEndDate) => {
        if (!modal?.intern) return;
        setActionLoading(true);
        try {
            await api.patch(`/employees/${modal.intern._id}/internship`, { newEndDate, status: 'extended' });
            toast.success(`Internship extended to ${formatDate(newEndDate)}`);
            closeModal();
            fetchAll?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to extend internship');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4a4 4 0 100-8 4 4 0 000 8z" label="Total Interns" value={summary.total} accent="bg-violet-100 text-violet-600" />
                <SummaryCard d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" label="Active" value={summary.active} accent="bg-violet-100 text-violet-600" />
                <SummaryCard d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" label="Completed" value={summary.accepted} accent="bg-orange-100 text-orange-600" />
                <SummaryCard d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" label="Awaiting Decision" value={summary.completed} accent="bg-blue-100 text-blue-600" />
            </div>

            {/* Filter bar */}
            <div className="bg-white border border-violet-100 rounded-2xl shadow-sm p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="relative md:col-span-2">
                        <Ico d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search by Name, ID or Email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 border border-violet-200 rounded-xl bg-violet-50/40 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2.5 border border-violet-200 rounded-xl bg-violet-50/40 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                        <option value="">All Statuses</option>
                        {Object.keys(STATUS_LABELS).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => { setSearch(''); setStatusFilter(''); }}
                        className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Table / empty state */}
            {filteredInterns.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-violet-100 bg-white px-6 py-16 text-center shadow-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
                        <Ico d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="h-7 w-7 text-violet-600" />
                    </div>
                    <p className="text-base font-bold text-violet-900">No interns found</p>
                    <p className="max-w-xs text-sm text-violet-500">Add an intern from the Employee Management page</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-violet-100 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-violet-100">
                        <thead className="bg-violet-50/60">
                            <tr>
                                {['Intern', 'Department', 'Role / Designation', 'Internship Period', 'Days Left', 'Status', 'Actions'].map((h) => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-violet-700">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-violet-50">
                            {filteredInterns.map((intern) => {
                                const daysLeft = getDaysLeftInfo(intern.internship?.endDate);
                                return (
                                    <tr key={intern._id} className="hover:bg-violet-50/40">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={intern.name} />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-violet-900">{intern.name}</p>
                                                    <p className="truncate text-xs text-violet-500">{intern.employeeId}</p>
                                                    <p className="truncate text-xs text-violet-400">{intern.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-violet-700">{intern.department?.name || '—'}</td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-violet-700">{intern.role || '—'}</p>
                                            <p className="text-xs text-violet-500">{intern.designation || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-violet-700">{formatDate(intern.internship?.startDate)} – {formatDate(intern.internship?.endDate)}</p>
                                            <p className="text-xs text-violet-500">{intern.internship?.durationMonths ? `${intern.internship.durationMonths} mo` : '—'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {daysLeft ? (
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${daysLeft.className}`}>{daysLeft.label}</span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-3"><StatusChip status={getDisplayStatus(intern)} /></td>
                                        <td className="px-4 py-3">
                                            <InternActions
                                                intern={intern}
                                                onView={(i) => navigate(`/hr/employees/${i._id}`)}
                                                onDrop={(i) => setModal({ type: 'reject', intern: i })}
                                                onAccept={(i) => setModal({ type: 'accept', intern: i })}
                                                onReject={(i) => setModal({ type: 'reject', intern: i })}
                                                onExtend={(i) => setModal({ type: 'extend', intern: i })}
                                                onConvert={(i) => setModal({ type: 'accept', intern: i })}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Intern -- reuses parent's form/handleCreate/loading/departments */}
            {showAddIntern && (
                <AddInternModal
                    onClose={() => setshowAddIntern(false)}
                    internForm={internForm}
                    setInternForm={setInternForm}
                    handleCreateIntern={handleCreateIntern}
                    loading={loading}
                    departments={departments}
                />
            )}

            {/* Internship action modals */}
            {modal?.type === 'view' && <ViewModal intern={modal.intern} onClose={closeModal} />}
            {modal?.type === 'accept' && (
                <AcceptModal intern={modal.intern} busy={actionLoading} onClose={closeModal} onConfirm={acceptIntern} />
            )}            {modal?.type === 'reject' && <RejectModal intern={modal.intern} busy={actionLoading} onClose={closeModal} onConfirm={rejectIntern} />}
            {modal?.type === 'extend' && <ExtendModal intern={modal.intern} busy={actionLoading} onClose={closeModal} onConfirm={extendIntern} />}
        </div>
    );
}