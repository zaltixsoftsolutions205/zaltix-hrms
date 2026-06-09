import { motion } from 'framer-motion';

const invoices = [
  { id: 'INV-2024-089', client: 'TechVision Pvt Ltd', amount: '₹2,45,000', date: 'Apr 12, 2025', status: 'paid', gst: '18%' },
  { id: 'INV-2024-090', client: 'Apex Solutions',     amount: '₹1,80,000', date: 'Apr 10, 2025', status: 'pending', gst: '18%' },
  { id: 'INV-2024-091', client: 'GlobalTech Inc',     amount: '₹5,20,000', date: 'Apr 08, 2025', status: 'overdue', gst: '18%' },
  { id: 'INV-2024-092', client: 'Skyline Enterprises',amount: '₹95,000',   date: 'Apr 06, 2025', status: 'paid',    gst: '18%' },
  { id: 'INV-2024-093', client: 'NovaTech Solutions', amount: '₹3,15,000', date: 'Apr 04, 2025', status: 'pending', gst: '18%' },
];

const statusLabel = { paid: 'Paid', pending: 'Pending', overdue: 'Overdue' };

export function RecentInvoices() {
  return (
    <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--fin-border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fin-fg)' }}>Recent Invoices</h3>
        <button className="text-xs font-medium" style={{ color: '#4ade80' }}>View all</button>
      </div>
      <table className="fin-table">
        <thead>
          <tr>
            <th>Invoice</th><th>Client</th><th>Amount</th><th>GST</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => (
            <motion.tr key={inv.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <td className="font-mono text-xs">{inv.id}</td>
              <td>{inv.client}</td>
              <td className="font-semibold">{inv.amount}</td>
              <td style={{ color: 'var(--fin-muted)' }}>{inv.gst}</td>
              <td>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold fin-status-${inv.status}`}>
                  {statusLabel[inv.status]}
                </span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
