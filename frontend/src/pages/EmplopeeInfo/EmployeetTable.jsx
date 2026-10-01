import Modal from "../../components/UI/Modal";
import EmployeeForm from "../../components/UI/EmployeeForm";
import { formatDate, getInitials, formatCurrency } from "../../utils/helpers";

export default function EmployeeTable({
    filtered,
    departments,
    projects,
    selectedEmp,
    loading,
    navigate,
    handleCreate,
    handleUpdateEmployee, // ADD THIS
    handleDelete,
    handleStatusChange,
    sendOffer,
    sendCreds,
    openEdit,
    openDocs,
    openAttach,
    fetchAll,
    // Modal State
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    showDocsModal,
    setShowDocsModal,
    showAttachModal,
    setShowAttachModal,

    // Other panels
    DocumentReviewPanel,
    AttachDocsPanel,
}) {
    const ROLE_COLORS = { employee: 'bg-violet-100 text-violet-700', sales: 'bg-amber-100 text-amber-700', field_sales: 'bg-amber-100 text-amber-700', hr: 'bg-violet-100 text-violet-700', admin: 'bg-gray-100 text-gray-900', technical_associate: 'bg-blue-100 text-blue-700', bda: 'bg-green-100 text-green-700' };
    const ROLE_LABELS = { employee: 'Employee', sales: 'Sales', field_sales: 'Field Sales', hr: 'HR', admin: 'Admin', technical_associate: 'Technical Associate', bda: 'BDA' };
    const TYPE_COLORS = { fresher: 'bg-violet-100 text-violet-700', experienced: 'bg-violet-100 text-violet-700' };
    const roleLabel = (role) => ROLE_LABELS[role] || role;
    const Chip = ({ label, colorCls }) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${colorCls}`}>{label}</span>
    );


    // Active/Inactive dropdown. `isActive` is treated as active unless explicitly false.
    const StatusDropdown = ({ emp, onChange }) => {
        const active = emp.isActive !== false;
        return (
            <select
                value={active ? 'active' : 'inactive'}
                onChange={e => onChange(emp, e.target.value === 'active')}
                className={`text-xs font-semibold rounded-lg border px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors ${active
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                    }`}
            >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        );
    };
    const Ico = ({ d, d2, className = 'w-4 h-4' }) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d={d} />{d2 && <path d={d2} />}
        </svg>
    );
    return (
        <>

            {
                filtered.length === 0 ? (
                    <div className="bg-white border border-violet-100 rounded-2xl shadow-sm py-16 flex flex-col items-center gap-3 text-violet-300">
                        <Ico d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" className="w-12 h-12" />
                        <p className="text-violet-500 font-semibold">No employees found</p>
                        <button onClick={() => setShowAddModal(true)} className="text-sm text-violet-600 hover:text-violet-800 font-semibold underline underline-offset-2">Add first employee →</button>
                    </div>
                ) : (
                    <>
                        {/* ── Mobile: Card list (hidden sm+) ── */}
                        <div className="sm:hidden space-y-3">
                            {filtered.map(emp => (
                                <div key={emp._id} className="bg-white border border-violet-100 rounded-2xl shadow-sm p-4 space-y-3" onClick={() => {
                                    navigate(`/hr/employees/${emp._id}`);
                                }}>
                                    {/* Avatar + info */}
                                    <div className="flex items-start gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-violet-200 text-violet-800 font-bold text-sm flex items-center justify-center flex-shrink-0">
                                            {getInitials(emp.name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-violet-900 truncate">{emp.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                <Chip label={roleLabel(emp.role)} colorCls={ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'} />
                                                {emp.department?.name && (
                                                    <span className="text-[11px] text-violet-600 font-medium">{emp.department.name}</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-violet-400 truncate mt-0.5">{emp.employeeId} · {emp.email}</p>
                                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                                {emp.employeeType && <Chip label={emp.employeeType} colorCls={TYPE_COLORS[emp.employeeType] || 'bg-gray-100 text-gray-600'} />}
                                                <StatusDropdown emp={emp} onChange={handleStatusChange} />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Meta grid */}
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Department', value: emp.department?.name || '—' },
                                            { label: 'Designation', value: emp.designation || '—' },
                                            { label: 'Salary', value: emp.basicSalary > 0 ? formatCurrency(emp.basicSalary) : '—' },
                                            { label: 'Joined', value: formatDate(emp.joiningDate) },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="bg-violet-50 rounded-xl px-3 py-2">
                                                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">{label}</p>
                                                <p className="text-xs font-semibold text-violet-800 truncate mt-0.5">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Action buttons */}
                                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-violet-50">
                                        <button onClick={(e) => { e.stopPropagation(); sendOffer(emp) }}
                                            className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Offer</button>
                                        <button onClick={(e) => { e.stopPropagation(); sendCreds(emp) }}
                                            className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Creds</button>
                                        <button onClick={(e) => { e.stopPropagation(); openEdit(emp) }}
                                            className="col-span-1 text-xs py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors">Edit</button>
                                        <button onClick={(e) => { e.stopPropagation(); openAttach(emp) }}
                                            className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Attach</button>
                                        {emp.employeeType && (
                                            <button onClick={(e) => { e.stopPropagation(); openDocs(emp); }}
                                                className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Review Docs</button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(emp); }}
                                            className="col-span-1 text-xs py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors">Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Desktop: Table (hidden below sm) ── */}
                        <div className="hidden sm:block bg-white border border-violet-100 rounded-2xl shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-violet-100 bg-violet-50/70">
                                            {['Employee', 'Department', 'Role / Type', 'Status', 'Joining', 'Salary', 'Actions'].map(h => (
                                                <th key={h} className="text-left text-[11px] font-bold text-violet-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap first:rounded-tl-2xl last:rounded-tr-2xl">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-violet-50">
                                        {filtered.map(emp => (

                                            <tr key={emp._id} className="cursor-pointer hover:bg-violet-50/40 transition-colors" onClick={() => {
                                                // console.log("Clicked:", emp._id);
                                                navigate(`/hr/employees/${emp._id}`);
                                            }}>
                                                {/* Employee */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-9 h-9 rounded-xl bg-violet-200 text-violet-800 font-bold text-sm flex items-center justify-center flex-shrink-0">
                                                            {getInitials(emp.name)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-violet-900 truncate max-w-[160px]">{emp.name}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                <Chip label={roleLabel(emp.role)} colorCls={ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'} />
                                                                {emp.department?.name && (
                                                                    <span className="text-[11px] text-violet-500 font-medium truncate max-w-[100px]">{emp.department.name}</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-violet-400 truncate max-w-[160px] mt-0.5">{emp.employeeId} · {emp.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Department */}
                                                <td className="px-4 py-3 text-sm text-violet-700 whitespace-nowrap">
                                                    {emp.department?.name || <span className="text-violet-300">—</span>}
                                                </td>
                                                {/* Role / Type */}
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        <Chip label={roleLabel(emp.role)} colorCls={ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'} />
                                                        {emp.employeeType && <Chip label={emp.employeeType} colorCls={TYPE_COLORS[emp.employeeType] || 'bg-gray-100 text-gray-600'} />}
                                                    </div>
                                                </td>
                                                {/* Status */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div onClick={(e) => e.stopPropagation()}>
                                                        <StatusDropdown emp={emp} onChange={handleStatusChange} />
                                                    </div>
                                                </td>
                                                {/* Joining */}
                                                <td className="px-4 py-3 text-sm text-violet-600 whitespace-nowrap">{formatDate(emp.joiningDate)}</td>
                                                {/* Salary */}
                                                <td className="px-4 py-3 text-sm font-semibold text-violet-800 whitespace-nowrap">
                                                    {emp.basicSalary > 0 ? formatCurrency(emp.basicSalary) : <span className="text-violet-300 font-normal">—</span>}
                                                </td>
                                                {/* Actions */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={(e) => { e.stopPropagation(); sendOffer(emp); }} title="Send offer letter"
                                                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors">
                                                            <Ico d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); sendCreds(emp); }} title="Send credentials"
                                                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors">
                                                            <Ico d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </button>
                                                        {emp.employeeType && (
                                                            <button onClick={(e) => { e.stopPropagation(); openDocs(emp); }} title="Review documents"
                                                                className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors">
                                                                <Ico d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </button>
                                                        )}
                                                        <button onClick={(e) => { e.stopPropagation(); openAttach(emp); }} title="Attach joining letter / ID card"
                                                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors">
                                                            <Ico d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); openEdit(emp); }} title="Edit employee"
                                                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors">
                                                            <Ico d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(emp); }} title="Delete employee"
                                                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
                                                            <Ico d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )
            }

            {/* ── Add Employee Modal ── */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add New Employee"
                size="lg"
            >
                <EmployeeForm
                    mode="create"
                    departments={departments}
                    projects={projects}
                    loading={loading}
                    onSubmit={(payload) => {
                        handleCreate(payload);
                    }}
                    onCancel={() => setShowAddModal(false)}
                />
            </Modal>
            {/* ── Edit Modal ── */}
            {
                selectedEmp && (
                    <Modal
                        isOpen={showEditModal}
                        onClose={() => setShowEditModal(false)}
                        title={`Edit — ${selectedEmp.name}`}
                        size="lg"
                    >
                        <EmployeeForm
                            mode="edit"
                            employee={selectedEmp}
                            departments={departments}
                            projects={projects}
                            loading={loading}
                            onSubmit={(payload) => {
                                handleUpdateEmployee(
                                    selectedEmp._id,
                                    payload
                                );
                            }}
                            onCancel={() => setShowEditModal(false)}
                        />
                    </Modal>
                )
            }

            {/* ── Documents Modal ── */}
            {
                selectedEmp && (
                    <Modal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} title={`Documents — ${selectedEmp.name}`} size="lg">
                        <DocumentReviewPanel emp={selectedEmp} />
                    </Modal>
                )
            }

            {/* ── Attach Joining Letter / ID Card Modal ── */}
            {
                selectedEmp && (
                    <Modal isOpen={showAttachModal} onClose={() => setShowAttachModal(false)} title={`Attach Docs — ${selectedEmp.name}`} size="md">
                        <AttachDocsPanel emp={selectedEmp} onDone={() => { setShowAttachModal(false); fetchAll(); }} />
                    </Modal>
                )
            }
        </>
    );
}

