import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import ProfileCompletionIndicator from '../../components/UI/ProfileCompletionIndicator';
import { formatDate, getInitials, getUploadUrl } from '../../utils/helpers';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';

const DOC_STATUS_STYLES = {
  pending_upload: 'bg-gray-100 text-gray-600',
  uploaded: 'bg-violet-100 text-violet-700',
  approved: 'bg-violet-100 text-violet-700',
  rejected: 'bg-gray-100 text-gray-900',
};
const DOC_STATUS_LABEL = {
  pending_upload: 'Pending Upload',
  uploaded: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected — Re-upload',
};

const EmployeeProfile = () => {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    phone: user?.phone || '',
    address: user?.address || '',
    emergencyContact: user?.emergencyContact || { name: '', phone: '', relation: '' },
    accountNumber: user?.accountNumber || '',
    ifscCode: user?.ifscCode || '',
    uanNumber: user?.uanNumber || '',
  });
  const [loading, setLoading] = useState(false);
  const [profileCompletion, setProfileCompletion] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoInputRef = useRef(null);

  // Documents state
  const [docsData, setDocsData] = useState(null);
  const [uploading, setUploading] = useState(null);
  const fileInputRefs = useRef({});

  // My profile (joiningLetter, idCard from HR)
  const [myProfile, setMyProfile] = useState(null);

  const fetchMyProfile = async () => {
    try {
      const res = await api.get('/user/profile');
      setMyProfile(res.data);
    } catch { /* silent */ }
  };

  const fetchDocs = async () => {
    try {
      const res = await api.get('/documents/my', { params: { _t: Date.now() } });
      setDocsData(res.data);
    } catch { /* silently ignore */ }
  };

  const fetchProfileCompletion = async () => {
    try {
      const res = await api.get('/user/profile-completion');
      setProfileCompletion(res.data);
    } catch (err) {
      console.error('Failed to fetch profile completion:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
    fetchProfileCompletion();
    fetchMyProfile();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.put('/user/profile', form);
      await refreshUser();
      await fetchProfileCompletion();
      toast.success('Profile updated successfully');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally { setLoading(false); }
  };

  const [photoDeleting, setPhotoDeleting] = useState(false);

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setPhotoLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/user/profile-photo', formData);
      await refreshUser();
      await fetchProfileCompletion();
      toast.success('Profile photo updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Photo upload failed');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handlePhotoDelete = async () => {
    if (!window.confirm('Remove your profile photo?')) return;
    setPhotoDeleting(true);
    try {
      await api.delete('/user/profile-photo');
      await refreshUser();
      await fetchProfileCompletion();
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove photo');
    } finally {
      setPhotoDeleting(false);
    }
  };

  const handleUpload = async (docType, file) => {
    if (!file) return;
    setUploading(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      await api.post('/documents/upload', formData);
      toast.success(`${docType} uploaded successfully!`);
      await fetchDocs();
      await fetchProfileCompletion();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(null); }
  };



  const info = [
    { label: 'Employee ID', value: user?.employeeId },
    { label: 'Department', value: user?.department?.name || 'Not Assigned' },
    { label: 'Designation', value: user?.designation || '—' },
    { label: 'Role', value: user?.role },
    { label: 'Joining Date', value: formatDate(user?.joiningDate) },
    { label: 'Email', value: user?.email },
  ];

  const approvedCount = docsData?.docs?.filter(d => d.status === 'approved').length ?? 0;
  const totalDocs = docsData?.docs?.length ?? 0;
  const allApproved = totalDocs > 0 && approvedCount === totalDocs;
  const progressPercent = totalDocs > 0 ? Math.round((approvedCount / totalDocs) * 100) : 0;

  // Derive alerts from own profile data only
  const profileAlerts = (() => {
    const alerts = [];
    if (profileCompletion && profileCompletion.percentage < 100) {
      const missing = profileCompletion.missing || [];
      if (profileCompletion.percentage < 60)
        alerts.push({ level: 'error', message: `Your profile is only ${profileCompletion.percentage}% complete. Complete it to access all features like payslip downloads.` });
      else if (profileCompletion.percentage < 80)
        alerts.push({ level: 'warning', message: `Your profile is ${profileCompletion.percentage}% complete. Missing: ${missing.join(', ') || 'some fields'}.` });
      else
        alerts.push({ level: 'info', message: `Profile ${profileCompletion.percentage}% complete. Add the remaining details to reach 100%.` });
    }
    if (docsData?.docs?.length > 0) {
      const rejected = docsData.docs.filter(d => d.status === 'rejected');
      const pendingUpload = docsData.docs.filter(d => d.status === 'pending_upload');
      if (rejected.length > 0)
        alerts.push({ level: 'error', message: `${rejected.length} document${rejected.length > 1 ? 's were' : ' was'} rejected. Please re-upload: ${rejected.map(d => d.docType).join(', ')}.` });
      if (pendingUpload.length > 0)
        alerts.push({ level: 'warning', message: `${pendingUpload.length} document${pendingUpload.length > 1 ? 's are' : ' is'} still pending upload. Upload them to complete onboarding.` });
    }
    if (!user?.phone)
      alerts.push({ level: 'info', message: 'Add your phone number so HR can reach you quickly.' });
    if (!user?.accountNumber || !user?.ifscCode)
      alerts.push({ level: 'info', message: 'Bank account details are missing. Add them so your salary can be processed correctly.' });
    return alerts;
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-5 animate-fade-in px-4 sm:px-0">
      {/* My Profile Intelligence Alerts */}
      <IntelligenceAlerts alerts={profileAlerts} />

      {/* Single file input — image/* lets OS offer camera + gallery on mobile */}
      <input type="file" accept="image/*" className="hidden" ref={photoInputRef}
        onChange={e => { handlePhotoUpload(e.target.files[0]); e.target.value = ''; }} />

      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 sm:p-5"
      >
        <div className="flex items-center gap-3 sm:gap-4">

          {/* Avatar column */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
            {/* Clickable avatar — edit overlay on hover, spinner while busy */}
            <div className="relative">
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoLoading || photoDeleting}
                className="relative block w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-gradient-to-br from-violet-600 to-violet-800 shadow-lg ring-4 ring-white focus:outline-none cursor-pointer group"
                title="Click to update photo"
              >
                {user?.profilePicture ? (
                  <img src={getUploadUrl(user.profilePicture)} alt={user?.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-white">
                    {getInitials(user?.name)}
                  </span>
                )}
                {/* Hover overlay with edit icon */}
                <span className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <span className="text-white text-[10px] font-semibold mt-1">Edit Photo</span>
                </span>
                {/* Loading spinner overlay */}
                {(photoLoading || photoDeleting) && (
                  <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <svg className="w-6 h-6 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx={12} cy={12} r={10}/>
                    </svg>
                  </span>
                )}
              </button>
              {/* Camera badge */}
              <span className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center pointer-events-none">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx={12} cy={13} r={4}/>
                </svg>
              </span>
            </div>
            {/* Remove link — only if photo exists */}
            {user?.profilePicture && !photoLoading && !photoDeleting && (
              <button
                onClick={handlePhotoDelete}
                className="text-[10px] text-gray-900 hover:text-gray-900 transition-colors leading-none"
              >
                Remove
              </button>
            )}
          </div>

          {/* Name, designation, badges */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold text-violet-900 leading-tight">{user?.name}</h2>
            <p className="text-xs sm:text-sm text-violet-500 mt-0.5 truncate">
              {user?.designation || user?.role} · {user?.department?.name || 'No Department'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
                <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" /> Active
              </span>
              {docsData?.employeeType && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                  docsData.employeeType === 'fresher' ? 'bg-violet-100 text-violet-700' : 'bg-violet-100 text-violet-700'
                }`}>
                  {docsData.employeeType}
                </span>
              )}
            </div>
            {!profileLoading && profileCompletion?.percentage < 100 && (
              <p className="text-[10px] text-violet-400 mt-1.5">Fill all details to unlock downloads</p>
            )}
          </div>

          {/* Completion circle */}
          {!profileLoading && profileCompletion && (
            <div className="flex-shrink-0">
              <ProfileCompletionIndicator
                percentage={profileCompletion.percentage}
                size={88}
                mobileSize={60}
                showLabel={true}
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Info Grid */}
      <Card>
        <h3 className="font-bold text-violet-900 mb-3 sm:mb-4">Professional Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {info.map(item => (
            <div key={item.label} className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5 capitalize">{item.value || '—'}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Editable Info */}
      <Card>
        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
          <h3 className="font-bold text-violet-900">Personal Information</h3>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn-secondary btn-sm whitespace-nowrap text-xs sm:text-sm">Edit</button>
          )}
        </div>

        {!editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">Phone</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5">{user?.phone || '—'}</p>
            </div>
            <div className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">Address</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5 line-clamp-2">{user?.address || '—'}</p>
            </div>
            <div className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl sm:col-span-2">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">Emergency Contact</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5">{user?.emergencyContact?.name || '—'}</p>
              {user?.emergencyContact?.phone && (
                <p className="text-[10px] sm:text-xs text-violet-500 mt-0.5">
                  {user.emergencyContact.phone} · {user.emergencyContact.relation}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="input-label text-xs sm:text-sm">Phone</label>
              <input
                className="input-field text-sm"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="input-label text-xs sm:text-sm">Address</label>
              <textarea
                className="input-field text-sm"
                rows={2}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Your address"
              />
            </div>
            <div>
              <p className="input-label text-xs sm:text-sm">Emergency Contact</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <input
                  className="input-field text-sm"
                  placeholder="Name"
                  value={form.emergencyContact.name}
                  onChange={e => setForm(f => ({
                    ...f,
                    emergencyContact: { ...f.emergencyContact, name: e.target.value }
                  }))}
                />
                <input
                  className="input-field text-sm"
                  placeholder="Phone"
                  value={form.emergencyContact.phone}
                  onChange={e => setForm(f => ({
                    ...f,
                    emergencyContact: { ...f.emergencyContact, phone: e.target.value }
                  }))}
                />
                <input
                  className="input-field text-sm"
                  placeholder="Relation"
                  value={form.emergencyContact.relation}
                  onChange={e => setForm(f => ({
                    ...f,
                    emergencyContact: { ...f.emergencyContact, relation: e.target.value }
                  }))}
                />
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button onClick={handleSave} disabled={loading} className="btn-primary text-sm py-1.5 sm:py-2">
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm py-1.5 sm:py-2">Cancel</button>
            </div>
          </div>
        )}
      </Card>

      {/* Bank & Payment Details */}
      <Card>
        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
          <h3 className="font-bold text-violet-900">Bank & Payment Details</h3>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn-secondary btn-sm whitespace-nowrap text-xs sm:text-sm">Edit</button>
          )}
        </div>

        {!editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">Account Number</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5">{user?.accountNumber || '—'}</p>
            </div>
            <div className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">IFSC Code</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5">{user?.ifscCode || '—'}</p>
            </div>
            <div className="p-2.5 sm:p-3 bg-violet-50/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-violet-500 font-medium uppercase tracking-wide">UAN Number</p>
              <p className="text-xs sm:text-sm font-semibold text-violet-900 mt-0.5">{user?.uanNumber || '—'}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="input-label text-xs sm:text-sm">Account Number</label>
                <input
                  className="input-field text-sm"
                  value={form.accountNumber}
                  onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                  placeholder="Bank account number"
                />
              </div>
              <div>
                <label className="input-label text-xs sm:text-sm">IFSC Code</label>
                <input
                  className="input-field text-sm"
                  value={form.ifscCode}
                  onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g. HDFC0001234"
                />
              </div>
              <div>
                <label className="input-label text-xs sm:text-sm">UAN Number</label>
                <input
                  className="input-field text-sm"
                  value={form.uanNumber}
                  onChange={e => setForm(f => ({ ...f, uanNumber: e.target.value }))}
                  placeholder="Universal Account Number"
                />
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button onClick={handleSave} disabled={loading} className="btn-primary text-sm py-1.5 sm:py-2">
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm py-1.5 sm:py-2">Cancel</button>
            </div>
          </div>
        )}
      </Card>

      {/* Documents Section */}
      {docsData?.employeeType && (
        <Card>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div>
              <h3 className="font-bold text-violet-900">Onboarding Documents</h3>
              <p className="text-[10px] sm:text-xs text-violet-400 mt-0.5">
                {allApproved
                  ? '✓ All documents approved! You can now download your payslips.'
                  : `${approvedCount}/${totalDocs} approved — upload all required documents to unlock payslip downloads.`}
              </p>
            </div>

            {totalDocs > 0 && (
              <div className="w-full sm:w-40">
                <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5 overflow-hidden">
                  <div
                    className="h-2 sm:h-2.5 bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1 sm:mt-1.5">
                  <span className="text-[10px] sm:text-xs text-gray-500">{approvedCount}/{totalDocs} approved</span>
                  <span className="text-xs sm:text-sm font-bold text-violet-700">{progressPercent}%</span>
                </div>
              </div>
            )}
          </div>

          {!allApproved && (
            <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-xl text-[10px] sm:text-xs text-amber-800 flex items-start gap-1.5 sm:gap-2">
              <svg width={14} height={14} className="sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <span>Payslip downloads are locked until all documents are approved by HR.</span>
            </div>
          )}

          <div className="space-y-2 sm:space-y-3">
            {docsData.docs.map((doc, i) => (
              <motion.div
                key={doc._id || i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-2.5 sm:p-3 border border-violet-100 rounded-xl bg-violet-50/40 hover:bg-violet-50/60 transition-colors"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1 w-full sm:w-auto">
                    <p className="text-xs sm:text-sm font-semibold text-violet-900">{doc.docType}</p>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                      <span className={`inline-block px-2 sm:px-2.5 py-0.5 rounded text-[10px] sm:text-xs font-medium ${DOC_STATUS_STYLES[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                        {DOC_STATUS_LABEL[doc.status] || doc.status}
                      </span>
                      {doc.status === 'rejected' && doc.rejectionReason && (
                        <span className="text-[10px] sm:text-xs text-gray-900 font-medium">{doc.rejectionReason}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 w-full sm:w-auto">
                    {doc.status === 'approved' && (
                      <div className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-violet-100 rounded-lg w-full sm:w-auto justify-center">
                        <svg width={12} height={12} className="sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[10px] sm:text-xs font-semibold text-violet-700">Approved</span>
                      </div>
                    )}

                    {(doc.status === 'pending_upload' || doc.status === 'rejected' || doc.status === 'uploaded') && (
                      <>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          ref={el => { fileInputRefs.current[doc.docType] = el; }}
                          onChange={e => {
                            handleUpload(doc.docType, e.target.files[0]);
                            e.target.value = '';
                          }}
                        />
                        <button
                          onClick={() => fileInputRefs.current[doc.docType]?.click()}
                          disabled={uploading === doc.docType}
                          className={`btn-sm text-[10px] sm:text-xs flex items-center gap-1 sm:gap-1.5 whitespace-nowrap w-full sm:w-auto justify-center py-1.5 sm:py-2 ${
                            doc.status === 'uploaded' ? 'btn-secondary' : 'btn-primary'
                          }`}
                        >
                          {uploading === doc.docType ? (
                            <>
                              <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <circle cx={12} cy={12} r={10} />
                              </svg>
                              <span className="sm:hidden">...</span>
                              <span className="hidden sm:inline">Uploading...</span>
                            </>
                          ) : (
                            <>
                              <svg width={10} height={10} className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              {doc.status === 'uploaded' ? 'Re-upload' : 'Upload'}
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {/* Downloads Section (visible only at 100% profile completion) */}
      {profileCompletion?.percentage === 100 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-violet-900">My Documents</h3>
              <p className="text-[10px] sm:text-xs text-violet-400 mt-0.5">Download your official documents issued by HR</p>
            </div>
          </div>

          {/* HR-issued documents */}
          <div className="space-y-2 mb-4">
            {[
              { key: 'joiningLetter', label: 'Joining Letter', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
              { key: 'idCard',        label: 'ID Card',        icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2' },
            ].map(({ key, label, icon }) => {
              const filePath = myProfile?.[key];
              const fileUrl = filePath ? (() => {
                if (/^https?:\/\//i.test(filePath)) return filePath;
                const n = filePath.startsWith('/') ? filePath : `/${filePath}`;
                try {
                  const apiUrl = import.meta.env.VITE_API_URL;
                  if (apiUrl) { const u = new URL(apiUrl); return `${u.origin}${n}`; }
                } catch { /* ignore */ }
                if (window.location.hostname === 'localhost' && window.location.port !== '5000')
                  return `${window.location.protocol}//${window.location.hostname}:5000${n}`;
                return `${window.location.origin}${n}`;
              })() : null;

              return (
                <div key={key} className="flex items-center justify-between p-3 border border-violet-100 rounded-xl bg-violet-50/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                        <path d={icon} />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-violet-900">{label}</span>
                  </div>
                  {fileUrl ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer" download
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-violet-300 font-medium">Not issued yet</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Employee's own approved uploaded documents */}
          {docsData?.docs?.filter(d => d.status === 'approved' && d.filePath).length > 0 && (
            <>
              <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-2">Your Uploaded Documents</p>
              <div className="space-y-2">
                {docsData.docs.filter(d => d.status === 'approved' && d.filePath).map((doc, i) => {
                  const filePath = doc.filePath;
                  const fileUrl = (() => {
                    if (/^https?:\/\//i.test(filePath)) return filePath;
                    const n = filePath.startsWith('/') ? filePath : `/${filePath}`;
                    try {
                      const apiUrl = import.meta.env.VITE_API_URL;
                      if (apiUrl) { const u = new URL(apiUrl); return `${u.origin}${n}`; }
                    } catch { /* ignore */ }
                    if (window.location.hostname === 'localhost' && window.location.port !== '5000')
                      return `${window.location.protocol}//${window.location.hostname}:5000${n}`;
                    return `${window.location.origin}${n}`;
                  })();
                  return (
                    <div key={doc._id || i} className="flex items-center justify-between p-3 border border-violet-100 rounded-xl bg-violet-50/40">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold text-violet-900">{doc.docType}</span>
                      </div>
                      <a href={fileUrl} target="_blank" rel="noreferrer" download
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </a>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
};

export default EmployeeProfile;
