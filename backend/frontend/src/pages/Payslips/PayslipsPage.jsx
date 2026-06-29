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

const PayslipsPage = () => {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [profileCompletion, setProfileCompletion] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    api.get('/payslips/my').then(r => setPayslips(r.data)).catch(() => {}).finally(() => setLoading(false));
    api.get('/user/profile-completion').then(r => setProfileCompletion(r.data)).catch(() => {});
  }, []);

  const handleDownload = async (id, month, year, empId) => {
    setDownloading(id);
    try {
      const res = await api.get(`/payslips/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
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
      const msg = err.response?.data?.message || err.message || 'Download failed';
      toast.error(msg);
      if (err.response?.data?.code === 'PHOTO_REQUIRED') {
        toast.error('Please upload your profile photo to unlock payslip downloads');
      }
      console.error('Download error:', err);
    }
    finally { setDownloading(null); }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 sm:space-y-5 animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">My Payslips</h2><p className="page-subtitle">View and download your salary slips</p></div>
      </div>

      {/* Profile Completion Warning */}
      {profileCompletion && profileCompletion.percentage < 100 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-l-4 border-l-amber-500 bg-amber-50">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 pt-0.5">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" className="text-amber-600">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {payslips.map(ps => (
              <motion.div key={ps._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="border border-violet-100 rounded-2xl p-4 hover:bg-violet-50/40 transition-colors">
                <div className="mb-3 pb-3 border-b border-violet-100">
                  <img src="/logo.png" alt="Zaltix Soft Solutions" className="h-7 object-contain" />
                </div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-violet-900">{monthName(ps.month)} {ps.year}</p>
                    <p className="text-xs text-violet-400 mt-0.5">Generated payslip</p>
                  </div>
                  <span className="badge-green">Published</span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Basic Salary</span>
                    <span className="font-medium text-violet-900">{formatCurrency(ps.basicSalary)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Gross Salary</span>
                    <span className="font-medium text-violet-900">{formatCurrency(ps.grossSalary)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Deductions</span>
                    <span className="font-medium text-gray-900">- {formatCurrency(sumMoney(ps.deductions))}</span>
                  </div>
                  <div className="border-t border-violet-100 pt-2 flex justify-between">
                    <span className="font-semibold text-violet-900">Net Pay</span>
                    <span className="font-bold text-golden-600 text-lg">{formatCurrency(ps.netSalary)}</span>
                  </div>
                </div>
                {profileCompletion && profileCompletion.percentage < 100 ? (
                  <div className="w-full text-center">
                    <button disabled
                      className="w-full btn-primary btn-sm flex items-center justify-center gap-2 opacity-40 cursor-not-allowed">
                      <SI d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" size={14} /> Download Locked
                    </button>
                    <p className="text-[10px] text-amber-600 mt-1">Complete your profile to unlock</p>
                  </div>
                ) : (
                  <button onClick={() => handleDownload(ps._id, ps.month, ps.year, user?.employeeId)}
                    disabled={downloading === ps._id}
                    className="w-full btn-primary btn-sm flex items-center justify-center gap-2">
                    {downloading === ps._id ? 'Downloading...' : <span className="flex items-center gap-1.5"><SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={14} /> Download PDF</span>}
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PayslipsPage;
