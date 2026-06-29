import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/UI/Card';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ChangePassword = () => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Navigate only after user state has been refreshed and isFirstLogin is false
  useEffect(() => {
    if (passwordChanged && user && !user.isFirstLogin) {
      navigate('/dashboard', { replace: true });
    }
  }, [passwordChanged, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast.error('Passwords do not match');
    if (form.newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await api.put('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password changed successfully!');
      await refreshUser();
      setPasswordChanged(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {user?.isFirstLogin && (
          <div className="mb-6 p-4 bg-golden-50 border border-golden-200 rounded-xl">
            <p className="text-sm font-medium text-golden-800 flex items-center gap-1.5"><SI d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" size={15} color="text-amber-500" /> First Login Detected</p>
            <p className="text-xs text-golden-600 mt-1">You must change your password before continuing.</p>
          </div>
        )}

        <Card>
          <h2 className="text-lg font-bold text-violet-900 mb-5">Change Password</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">Current Password</label>
              <input type="password" className="input-field" placeholder="Enter current password"
                value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} required />
            </div>
            <div>
              <label className="input-label">New Password</label>
              <input type="password" className="input-field" placeholder="Minimum 6 characters"
                value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} required minLength={6} />
            </div>
            <div>
              <label className="input-label">Confirm New Password</label>
              <input type="password" className="input-field" placeholder="Re-enter new password"
                value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default ChangePassword;
