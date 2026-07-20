import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import EmptyState from '../../components/UI/EmptyState';
import { formatCurrency, monthName, sumMoney } from '../../utils/helpers';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const PayslipsPage = ({ employeeId = null }) => {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [profileCompletion, setProfileCompletion] = useState(null);
  const { user } = useAuth();

  useEffect(() => {

    const loadPayslips = async () => {

      try {

        setLoading(true);

        const url = employeeId
          ? `/payslips/my/${employeeId}/showall`
          : "/payslips/my";

        const res = await api.get(url);

        setPayslips(res.data);

      } catch (err) {

        toast.error("Failed to load payslips");

      } finally {

        setLoading(false);

      }

    };

    // Call the function
    loadPayslips();

    console.log("Employee ID:", employeeId);

    if (!employeeId) {

      api.get("/user/profile-completion")
        .then((r) => setProfileCompletion(r.data))
        .catch(() => { });

    }

  }, [employeeId]);

  const handleViewPdf = async (id) => {
    try {
      const res = await api.get(`/payslips/${id}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      toast.success('Payslip opened');
    } catch (err) {
      let msg = err.message || 'Unable to open payslip';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.message) msg = json.message;
        } catch (_) { }
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }
      toast.error(msg);
      console.error('View payslip error:', err);
    }
  };

  const handleDownload = async (id, month, year, empId) => {
    setDownloading(id);
    try {
      const res = await api.get(`/payslips/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const cd = res.headers?.['content-disposition'];
      let filename = '';
      if (cd) {
        const m = cd.match(/filename\*?=(?:UTF-8''?)?"?([^";]+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1].replace(/"/g, ''));
      }
      // Fallback: match backend's format — Payslip_Month_Year.pdf (employee ID not available client-side)
      if (!filename) filename = `Payslip_${FULL_MONTHS[month - 1]}_${year}${empId ? '_' + empId : ''}.pdf`;
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success('Payslip downloaded!');
    } catch (err) {
      let msg = err.message || 'Download failed';
      let code = null;
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.message) msg = json.message;
          if (json.code) code = json.code;
        } catch (_) { }
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
        code = err.response?.data?.code;
      }
      toast.error(msg);
      if (code === 'PHOTO_REQUIRED') {
        toast.error('Please upload your profile photo to unlock payslip downloads');
      }
      console.error('Download error:', err);
    }
    finally { setDownloading(null); }
  };

  return (
    <div className="max-w-8xl mx-auto px-3 sm:px-4 space-y-4 sm:space-y-5 animate-fade-in">
      {!employeeId && (
        <div className="page-header">
          <div><h2 className="page-title">My Payslips</h2><p className="page-subtitle">View and download your salary slips</p></div>
        </div>
      )}

      {/* Profile Completion Warning */}
      {!employeeId && profileCompletion && profileCompletion.percentage < 100 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-l-4 border-l-amber-500 bg-amber-50">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 pt-0.5">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" className="text-amber-600">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-amber-900">Profile Incomplete ({profileCompletion.percentage}%)</h3>
                <p className="text-sm text-amber-800 mt-0.5">
                  Complete your profile including uploading a passport size photo to unlock payslip downloads.
                  <a href="/profile" className="font-semibold underline ml-1">Go to Profile →</a>
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <Card>
        {loading ? (
          <div className="py-10 text-center text-violet-400 text-sm">Loading...</div>
        ) : payslips.length === 0 ? (
          <EmptyState icon={<SI d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" size={40} color="text-violet-400" />} title="No payslips yet" message="Your payslips will appear here once published by HR." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-violet-100 text-left text-violet-700">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Generated By</th>
                  <th className="px-3 py-2">Basic</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Net Pay</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map(ps => (
                  <tr key={ps._id} className="border-b border-violet-50 hover:bg-violet-50/40">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-violet-900">{ps.employee?.name || user?.name || 'Employee'}</p>
                      <p className="text-xs text-violet-400">{ps.employee?.employeeId || user?.employeeId || '—'}</p>
                    </td>
                    <td className="px-3 py-3">{monthName(ps.month)} {ps.year}</td>
                    <td className="px-3 py-3 text-gray-600">{ps.generatedBy?.name || 'HR'}</td>
                    <td className="px-3 py-3">{formatCurrency(ps.basicSalary)}</td>
                    <td className="px-3 py-3">{formatCurrency(ps.grossSalary)}</td>
                    <td className="px-3 py-3 font-semibold text-golden-600">{formatCurrency(ps.netSalary)}</td>
                    <td className="px-3 py-3">
                      {!employeeId && profileCompletion && profileCompletion.percentage < 100 ? (
                        <span className="text-xs text-amber-600">Locked</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewPdf(ps._id)}
                            className="btn-primary btn-sm flex items-center gap-1"
                          >
                            <SI d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" size={13} /> View
                          </button>
                          <button
                            onClick={() => handleDownload(ps._id, ps.month, ps.year, user?.employeeId)}
                            disabled={downloading === ps._id}
                            className="btn-secondary btn-sm flex items-center gap-1"
                          >
                            {downloading === ps._id ? '...' : <><SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={13} /> Download</>}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PayslipsPage;
