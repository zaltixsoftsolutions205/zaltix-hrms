import { useState, useEffect } from 'react';
import { Save, Check } from 'lucide-react';
import api from '../../../../utils/api';

export function FinSettings() {
  const [activeTab, setActiveTab] = useState('tax');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/finance/settings').then(r => setSettings(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const saveSettings = async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.put('/finance/settings', patch);
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (_) {}
    finally { setSaving(false); }
  };

  const tabs = [
    { id: 'tax',     label: 'Tax Settings'     },
    { id: 'invoice', label: 'Invoice Settings'  },
    { id: 'payment', label: 'Payment Modes'     },
  ];

  const inp = { width: '100%', background: 'var(--fin-surface)', border: '1px solid var(--fin-border)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: 'var(--fin-fg)', fontSize: '0.875rem', outline: 'none', marginTop: '6px' };
  const lbl = { fontSize: '11px', fontWeight: 600, color: 'var(--fin-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' };

  if (loading || !settings) {
    return <div className="fin-card flex items-center justify-center py-12" style={{ color: 'var(--fin-muted)' }}>Loading settings…</div>;
  }

  return (
    <div className="fin-card" style={{ maxWidth: '700px' }}>
      <div className="flex items-center gap-1 mb-6 pb-3" style={{ borderBottom: '1px solid var(--fin-border)' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: activeTab === tab.id ? 'rgba(74,222,128,0.15)' : 'transparent', color: activeTab === tab.id ? '#4ade80' : 'var(--fin-muted)' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tax' && (
        <div className="space-y-5 max-w-sm">
          {[['GST Rate (%)', 'gstRate'], ['CGST (%)', 'cgst'], ['SGST (%)', 'sgst'], ['IGST (%)', 'igst'], ['TDS Default Rate (%)', 'tdsRate']].map(([label, key]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <input type="number" value={settings[key] ?? ''} onChange={e => setSettings(p => ({ ...p, [key]: +e.target.value }))} style={inp} />
            </div>
          ))}
          <button className="fin-btn fin-btn-primary mt-2" onClick={() => saveSettings({ gstRate: settings.gstRate, cgst: settings.cgst, sgst: settings.sgst, igst: settings.igst, tdsRate: settings.tdsRate })} disabled={saving}>
            {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : <><Save className="h-3.5 w-3.5" />Save Tax Settings</>}
          </button>
        </div>
      )}

      {activeTab === 'invoice' && (
        <div className="space-y-5 max-w-sm">
          {[['Invoice Prefix', 'invoicePrefix', 'text'], ['Starting Number', 'invoiceStart', 'number'], ['Default Payment Terms (Days)', 'paymentTerms', 'number']].map(([label, key, type]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <input type={type} value={settings[key] ?? ''} onChange={e => setSettings(p => ({ ...p, [key]: type === 'number' ? +e.target.value : e.target.value }))} style={inp} />
            </div>
          ))}
          <div>
            <label style={lbl}>Default Notes</label>
            <textarea value={settings.defaultNotes ?? ''} onChange={e => setSettings(p => ({ ...p, defaultNotes: e.target.value }))}
              style={{ ...inp, minHeight: '80px', resize: 'vertical' }} />
          </div>
          <button className="fin-btn fin-btn-primary" onClick={() => saveSettings({ invoicePrefix: settings.invoicePrefix, invoiceStart: settings.invoiceStart, paymentTerms: settings.paymentTerms, defaultNotes: settings.defaultNotes })} disabled={saving}>
            {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : <><Save className="h-3.5 w-3.5" />Save Invoice Settings</>}
          </button>
        </div>
      )}

      {activeTab === 'payment' && (
        <div className="space-y-5 max-w-sm">
          <div>
            <label style={{ ...lbl, marginBottom: '12px' }}>Enabled Payment Modes</label>
            <div className="space-y-2 mt-3">
              {['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Debit Card'].map((mode) => {
                const enabled = (settings.enabledModes || []).includes(mode);
                const toggle = () => {
                  const modes = enabled ? settings.enabledModes.filter(m => m !== mode) : [...(settings.enabledModes || []), mode];
                  setSettings(p => ({ ...p, enabledModes: modes }));
                };
                return (
                  <label key={mode} className="flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors" style={{ background: '#f5f3ff' }}>
                    <input type="checkbox" checked={enabled} onChange={toggle} style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }} />
                    <span className="text-sm" style={{ color: 'var(--fin-fg)' }}>{mode}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label style={lbl}>Default Currency</label>
            <input value={settings.currency ?? 'INR'} onChange={e => setSettings(p => ({ ...p, currency: e.target.value }))} style={inp} />
          </div>
          <button className="fin-btn fin-btn-primary" onClick={() => saveSettings({ enabledModes: settings.enabledModes, currency: settings.currency })} disabled={saving}>
            {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : <><Save className="h-3.5 w-3.5" />Save Payment Settings</>}
          </button>
        </div>
      )}
    </div>
  );
}
