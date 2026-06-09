import { useState, useEffect } from 'react';
import { BookOpen, ArrowUpRight, ArrowDownRight, Scale, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { FinKPICard } from '../components/FinKPICard';
import api from '../../../../utils/api';

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const typeStyle = {
  Credit:  { color: '#16a34a', bg: '#dcfce7' },
  Debit:   { color: '#dc2626', bg: '#fee2e2' },
};

const accType = {
  Asset:     { color: '#16a34a', bg: '#dcfce7' },
  Liability: { color: '#dc2626', bg: '#fee2e2' },
  Equity:    { color: '#7c3aed', bg: '#ede9fe' },
  Revenue:   { color: '#16a34a', bg: '#dcfce7' },
  Expense:   { color: '#d97706', bg: '#fef3c7' },
};

const chartOfAccounts = [
  { code: '1000', name: 'Bank Account',          type: 'Asset' },
  { code: '1100', name: 'Accounts Receivable',   type: 'Asset' },
  { code: '2000', name: 'Accounts Payable',      type: 'Liability' },
  { code: '2100', name: 'Salary Payable',        type: 'Liability' },
  { code: '2200', name: 'GST Payable',           type: 'Liability' },
  { code: '3000', name: 'Retained Earnings',     type: 'Equity' },
  { code: '4000', name: 'Sales Revenue',         type: 'Revenue' },
  { code: '5000', name: 'Salary Expense',        type: 'Expense' },
  { code: '5100', name: 'Infrastructure Expense',type: 'Expense' },
];

export function FinLedger() {
  const [tab, setTab] = useState('journal');
  const [ledger, setLedger] = useState({ entries: [], totalCredit: 0, totalDebit: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/finance/ledger').then(r => setLedger(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { entries = [], totalCredit = 0, totalDebit = 0, balance = 0 } = ledger;
  const isBalanced = Math.abs(totalCredit - totalDebit) < 0.01;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinKPICard title="Total Debits"    value={`₹${(totalDebit / 100000).toFixed(1)}L`}   icon={ArrowUpRight}   accentColor="revenue" />
        <FinKPICard title="Total Credits"   value={`₹${(totalCredit / 100000).toFixed(1)}L`}  icon={ArrowDownRight} accentColor="expense" />
        <FinKPICard title="Journal Entries" value={String(entries.length)}                     icon={BookOpen}       accentColor="info"    />
        <FinKPICard title="Balance"         value={`₹${(Math.abs(balance) / 100000).toFixed(1)}L`} icon={Scale}     accentColor="profit"  />
      </div>

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
          <div className="flex items-center gap-1">
            {[['journal', 'Journal Entries'], ['coa', 'Chart of Accounts']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{ background: tab === id ? '#ede9fe' : 'transparent', color: tab === id ? '#7c3aed' : '#6b7280' }}>
                {label}
              </button>
            ))}
          </div>
          <button className="fin-btn fin-btn-outline"><Download className="h-3.5 w-3.5" />Export</button>
        </div>

        <div className="overflow-x-auto">
          {tab === 'journal' && (
            loading ? (
              <div className="flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading…</div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--fin-muted)' }}>No ledger entries</div>
            ) : (
              <table className="fin-table">
                <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Debit</th><th>Credit</th><th>Type</th></tr></thead>
                <tbody>
                  {entries.map((je, i) => (
                    <motion.tr key={`${je._id}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                      <td className="text-xs whitespace-nowrap" style={{ color: 'var(--fin-muted)' }}>{fmtDate(je.date)}</td>
                      <td className="text-xs">{je.description}</td>
                      <td className="text-xs font-medium">{je.account}</td>
                      <td className="font-semibold text-xs" style={{ color: je.debit > 0 ? '#16a34a' : '#6b7280' }}>{je.debit > 0 ? fmt(je.debit) : '—'}</td>
                      <td className="font-semibold text-xs" style={{ color: je.credit > 0 ? '#dc2626' : '#6b7280' }}>{je.credit > 0 ? fmt(je.credit) : '—'}</td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: typeStyle[je.type]?.color, background: typeStyle[je.type]?.bg }}>
                          {je.type}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {tab === 'coa' && (
            <table className="fin-table">
              <thead><tr><th>Code</th><th>Account Name</th><th>Type</th></tr></thead>
              <tbody>
                {chartOfAccounts.map((acc, i) => (
                  <motion.tr key={acc.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td className="font-mono text-xs">{acc.code}</td>
                    <td className="font-semibold">{acc.name}</td>
                    <td>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: accType[acc.type]?.color, background: accType[acc.type]?.bg }}>
                        {acc.type}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
