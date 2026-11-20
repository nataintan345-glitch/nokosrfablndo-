import { useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  LogOut,
  Pencil,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  PublicRentalAccount,
  TenantOrderStatus,
  TenantWorkspaceData,
  TenantWorkspaceOrder,
  TenantWorkspaceService,
} from '../types';
import { fileToBase64, formatDateTime, formatRupiah } from '../utils/format';

interface TenantDashboardViewProps {
  token: string;
  rentalInfo: PublicRentalAccount;
  workspace: TenantWorkspaceData;
  nowTick: number;
  onWorkspaceUpdated: (ws: TenantWorkspaceData) => void;
  onLogout: () => Promise<void>;
}

type TenantTab = 'overview' | 'orders' | 'services' | 'settings';

function formatRemainingLease(expiresAtIso: string, nowMs: number): string {
  const diff = Date.parse(expiresAtIso) - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return 'Kedaluwarsa';
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit ${seconds} detik`;
}

function getTenantOrderStatusMeta(status: TenantOrderStatus): {
  label: string;
  className: string;
} {
  if (status === 'completed') {
    return {
      label: 'Selesai',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (status === 'processing') {
    return {
      label: 'Diproses',
      className: 'bg-blue-50 text-blue-800 border-blue-200',
    };
  }
  if (status === 'cancelled') {
    return {
      label: 'Dibatalkan',
      className: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  return {
    label: 'Menunggu',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

export function TenantDashboardView({
  token,
  rentalInfo,
  workspace,
  nowTick,
  onWorkspaceUpdated,
  onLogout,
}: TenantDashboardViewProps) {
  const [tab, setTab] = useState<TenantTab>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Order creation & management state
  const [ordName, setOrdName] = useState('');
  const [ordContact, setOrdContact] = useState('');
  const [ordApp, setOrdApp] = useState(workspace.services[0]?.appName || 'WhatsApp');
  const [ordCountry, setOrdCountry] = useState('Indonesia');
  const [ordQty, setOrdQty] = useState('1');
  const [ordTotal, setOrdTotal] = useState(
    String(workspace.services[0]?.price || 6500)
  );
  const [ordNumber, setOrdNumber] = useState('');
  const [ordOtp, setOrdOtp] = useState('');
  const [ordNote, setOrdNote] = useState('');
  const [ordSearch, setOrdSearch] = useState('');
  const [ordBusy, setOrdBusy] = useState(false);
  const [ordError, setOrdError] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<TenantWorkspaceOrder | null>(null);
  const [editOrdNumber, setEditOrdNumber] = useState('');
  const [editOrdOtp, setEditOrdOtp] = useState('');
  const [editOrdNote, setEditOrdNote] = useState('');
  const [editOrdStatus, setEditOrdStatus] = useState<TenantOrderStatus>('processing');

  // Service management state
  const [editingSrvId, setEditingSrvId] = useState<string | null>(null);
  const [srvApp, setSrvApp] = useState('');
  const [srvCountry, setSrvCountry] = useState('Indonesia');
  const [srvCode, setSrvCode] = useState('+62');
  const [srvPrice, setSrvPrice] = useState('6500');
  const [srvStock, setSrvStock] = useState('20');
  const [srvTime, setSrvTime] = useState('1-5 Menit');
  const [srvBusy, setSrvBusy] = useState(false);
  const [srvError, setSrvError] = useState<string | null>(null);

  // Tenant settings & QRIS state
  const [storeTitle, setStoreTitle] = useState(workspace.storeTitle);
  const [whatsapp, setWhatsapp] = useState(workspace.whatsapp);
  const [telegram, setTelegram] = useState(workspace.telegram);
  const [merchantName, setMerchantName] = useState(workspace.qrisMerchantName);
  const [instruction, setInstruction] = useState(workspace.paymentInstruction);
  const [settingBusy, setSettingBusy] = useState(false);
  const [settingMsg, setSettingMsg] = useState<string | null>(null);
  const [settingErr, setSettingErr] = useState<string | null>(null);
  const [qrisUploading, setQrisUploading] = useState(false);

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const stats = useMemo(() => {
    let completed = 0;
    let active = 0;
    let revenue = 0;
    for (const o of workspace.orders) {
      if (o.status === 'completed') {
        completed++;
        revenue += o.totalAmount;
      } else if (o.status === 'pending' || o.status === 'processing') {
        active++;
        if (o.status === 'processing') revenue += o.totalAmount;
      }
    }
    return {
      totalOrders: workspace.orders.length,
      completed,
      active,
      revenue,
      activeServices: workspace.services.filter((s) => s.active).length,
    };
  }, [workspace.orders, workspace.services]);

  const filteredOrders = useMemo(() => {
    const q = ordSearch.trim().toLowerCase();
    return workspace.orders.filter((o) => {
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerContact.toLowerCase().includes(q) ||
        o.appName.toLowerCase().includes(q) ||
        o.assignedNumber.toLowerCase().includes(q)
      );
    });
  }, [workspace.orders, ordSearch]);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrdBusy(true);
    setOrdError(null);
    try {
      const res = await fetch('/api/tenant/orders', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          customerName: ordName.trim(),
          customerContact: ordContact.trim(),
          appName: ordApp.trim(),
          country: ordCountry.trim(),
          quantity: Number(ordQty) || 1,
          totalAmount: Number(ordTotal) || 0,
          assignedNumber: ordNumber.trim(),
          otpCode: ordOtp.trim(),
          note: ordNote.trim(),
          status: ordNumber.trim() ? 'processing' : 'pending',
        }),
      });
      const data = (await res.json()) as {
        tenantWorkspace?: TenantWorkspaceData;
        error?: string;
      };
      if (!res.ok || !data.tenantWorkspace) {
        throw new Error(data.error || 'Gagal mencatat pesanan.');
      }
      onWorkspaceUpdated(data.tenantWorkspace);
      setOrdName('');
      setOrdContact('');
      setOrdNumber('');
      setOrdOtp('');
      setOrdNote('');
    } catch (err) {
      setOrdError(err instanceof Error ? err.message : 'Gagal mencatat pesanan.');
    } finally {
      setOrdBusy(false);
    }
  };

  const handleSaveOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setOrdBusy(true);
    try {
      const res = await fetch(
        `/api/tenant/orders/${encodeURIComponent(editingOrder.id)}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({
            assignedNumber: editOrdNumber.trim(),
            otpCode: editOrdOtp.trim(),
            note: editOrdNote.trim(),
            status: editOrdStatus,
          }),
        }
      );
      const data = (await res.json()) as { tenantWorkspace?: TenantWorkspaceData };
      if (res.ok && data.tenantWorkspace) {
        onWorkspaceUpdated(data.tenantWorkspace);
        setEditingOrder(null);
      }
    } finally {
      setOrdBusy(false);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    const res = await fetch(`/api/tenant/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const data = (await res.json()) as { tenantWorkspace?: TenantWorkspaceData };
    if (res.ok && data.tenantWorkspace) {
      onWorkspaceUpdated(data.tenantWorkspace);
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSrvBusy(true);
    setSrvError(null);
    try {
      const url = editingSrvId
        ? `/api/tenant/services/${encodeURIComponent(editingSrvId)}`
        : '/api/tenant/services';
      const res = await fetch(url, {
        method: editingSrvId ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          appName: srvApp.trim(),
          country: srvCountry.trim(),
          countryCode: srvCode.trim(),
          price: Number(srvPrice),
          stock: Number(srvStock),
          estimatedTime: srvTime.trim(),
        }),
      });
      const data = (await res.json()) as {
        tenantWorkspace?: TenantWorkspaceData;
        error?: string;
      };
      if (!res.ok || !data.tenantWorkspace) {
        throw new Error(data.error || 'Gagal menyimpan layanan.');
      }
      onWorkspaceUpdated(data.tenantWorkspace);
      setEditingSrvId(null);
      setSrvApp('');
      setSrvCountry('Indonesia');
      setSrvCode('+62');
      setSrvPrice('6500');
      setSrvStock('20');
      setSrvTime('1-5 Menit');
    } catch (err) {
      setSrvError(err instanceof Error ? err.message : 'Gagal menyimpan layanan.');
    } finally {
      setSrvBusy(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    const res = await fetch(`/api/tenant/services/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const data = (await res.json()) as { tenantWorkspace?: TenantWorkspaceData };
    if (res.ok && data.tenantWorkspace) {
      onWorkspaceUpdated(data.tenantWorkspace);
    }
  };

  const startEditService = (srv: TenantWorkspaceService) => {
    setEditingSrvId(srv.id);
    setSrvApp(srv.appName);
    setSrvCountry(srv.country);
    setSrvCode(srv.countryCode);
    setSrvPrice(String(srv.price));
    setSrvStock(String(srv.stock));
    setSrvTime(srv.estimatedTime);
  };

  const handleSaveTenantSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingBusy(true);
    setSettingMsg(null);
    setSettingErr(null);
    try {
      const res = await fetch('/api/tenant/settings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          storeTitle: storeTitle.trim(),
          whatsapp: whatsapp.trim(),
          telegram: telegram.trim(),
          qrisMerchantName: merchantName.trim(),
          paymentInstruction: instruction.trim(),
        }),
      });
      const data = (await res.json()) as {
        tenantWorkspace?: TenantWorkspaceData;
        error?: string;
      };
      if (!res.ok || !data.tenantWorkspace) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan penyewa.');
      }
      onWorkspaceUpdated(data.tenantWorkspace);
      setSettingMsg('Pengaturan toko khusus penyewa berhasil disimpan.');
    } catch (err) {
      setSettingErr(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.'
      );
    } finally {
      setSettingBusy(false);
    }
  };

  const handleUploadTenantQris = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrisUploading(true);
    setSettingErr(null);
    try {
      const encoded = await fileToBase64(file);
      const res = await fetch('/api/tenant/qris', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          dataBase64: encoded.dataBase64,
          mimeType: file.type,
        }),
      });
      const data = (await res.json()) as {
        tenantWorkspace?: TenantWorkspaceData;
        error?: string;
      };
      if (!res.ok || !data.tenantWorkspace) {
        throw new Error(data.error || 'Gagal mengunggah QRIS.');
      }
      onWorkspaceUpdated(data.tenantWorkspace);
      setSettingMsg('Foto QRIS khusus penyewa berhasil diunggah.');
    } catch (err) {
      setSettingErr(err instanceof Error ? err.message : 'Gagal upload QRIS.');
    } finally {
      setQrisUploading(false);
    }
  };

  const handleDeleteTenantQris = async () => {
    setQrisUploading(true);
    try {
      const res = await fetch('/api/tenant/qris', {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { tenantWorkspace?: TenantWorkspaceData };
      if (res.ok && data.tenantWorkspace) {
        onWorkspaceUpdated(data.tenantWorkspace);
      }
    } finally {
      setQrisUploading(false);
    }
  };

  const exportTenantCsv = () => {
    const headers = [
      'ID',
      'Waktu',
      'Pelanggan',
      'Kontak',
      'Aplikasi',
      'Negara',
      'Qty',
      'Total',
      'Nomor Nokos',
      'OTP',
      'Status',
    ];
    const rows = workspace.orders.map((o) => [
      o.id,
      o.createdAt,
      o.customerName,
      o.customerContact || '-',
      o.appName,
      o.country,
      String(o.quantity),
      String(o.totalAmount),
      o.assignedNumber || '-',
      o.otpCode || '-',
      getTenantOrderStatusMeta(o.status).label,
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pesanan-sewa-${rentalInfo.username}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header khusus Penyewa */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">
              Dashboard Penyewa · {rentalInfo.tenantName}
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Workspace Khusus Penyewa</span>
            </span>
          </div>
          <p className="text-xs text-slate-600 font-mono tabular-nums flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              Sisa aktif sewa: {formatRemainingLease(rentalInfo.expiresAt, nowTick)}
            </span>
            <span className="text-slate-300">·</span>
            <span>Berakhir {formatDateTime(rentalInfo.expiresAt)}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap self-start md:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar Akun Sewa</span>
        </button>
      </div>

      {/* Sub-Nav Tabs khusus Penyewa */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            tab === 'overview'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Ringkasan Sewa</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            tab === 'orders'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Pesanan Saya ({workspace.orders.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('services')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            tab === 'services'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Layanan Saya ({workspace.services.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            tab === 'settings'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          QRIS & Profil Toko Saya
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="bg-slate-900 text-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">
                Area Terisolasi Khusus Penyewa (@{rentalInfo.username})
              </p>
              <h2 className="text-lg font-bold">{workspace.storeTitle}</h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Seluruh pesanan, katalog layanan, dan QRIS di halaman ini sepenuhnya milik akun sewa Anda dan terpisah dari data serta pengaturan Dashboard Owner Utama.
              </p>
            </div>
            <div className="text-xs font-mono text-slate-300 shrink-0 sm:text-right">
              <p>Durasi Paket: {rentalInfo.durationDays} Hari</p>
              <p className="text-white font-semibold mt-0.5">
                Status: Aktif
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Pesanan Saya</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {stats.totalOrders}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Sedang Berjalan</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                {stats.active}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Pesanan Selesai</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {stats.completed}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Omzet Saya</p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatRupiah(stats.revenue)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">
                Mulai Kelola Pesanan & QRIS Anda
              </p>
              <p className="text-xs text-slate-500">
                Catat transaksi Nokos pelanggan Anda atau unggah foto QRIS Anda sendiri.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('orders')}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                Kelola Pesanan Saya
              </button>
              <button
                type="button"
                onClick={() => setTab('settings')}
                className="px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg"
              >
                Atur QRIS Saya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TENANT OWN ORDERS */}
      {tab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateOrder}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
          >
            <h2 className="text-base font-bold text-slate-900">
              + Catat Pesanan Baru
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Pelanggan
              </label>
              <input
                type="text"
                required
                value={ordName}
                onChange={(e) => setOrdName(e.target.value)}
                placeholder="Nama pembeli"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kontak / Nomor Aktif Pembeli
              </label>
              <input
                type="text"
                value={ordContact}
                onChange={(e) => setOrdContact(e.target.value)}
                placeholder="08xxx / @username"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Aplikasi
                </label>
                <input
                  type="text"
                  required
                  value={ordApp}
                  onChange={(e) => setOrdApp(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Negara
                </label>
                <input
                  type="text"
                  value={ordCountry}
                  onChange={(e) => setOrdCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jumlah
                </label>
                <input
                  type="number"
                  min={1}
                  value={ordQty}
                  onChange={(e) => setOrdQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Total (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={ordTotal}
                  onChange={(e) => setOrdTotal(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nomor Nokos (Opsional)
              </label>
              <input
                type="text"
                value={ordNumber}
                onChange={(e) => setOrdNumber(e.target.value)}
                placeholder="+62812xxxx"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kode OTP (Opsional)
              </label>
              <input
                type="text"
                value={ordOtp}
                onChange={(e) => setOrdOtp(e.target.value)}
                placeholder="123456"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan (Opsional)
              </label>
              <input
                type="text"
                value={ordNote}
                onChange={(e) => setOrdNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            {ordError && <p className="text-xs text-rose-600">{ordError}</p>}
            <button
              type="submit"
              disabled={ordBusy}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
            >
              {ordBusy ? 'Menyimpan...' : 'Simpan Pesanan'}
            </button>
          </form>

          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={ordSearch}
                  onChange={(e) => setOrdSearch(e.target.value)}
                  placeholder="Cari nama, aplikasi, atau nomor Nokos..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={exportTenantCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 text-xs font-semibold text-slate-700 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                Belum ada catatan pesanan di workspace Anda.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((o) => {
                  const meta = getTenantOrderStatusMeta(o.status);
                  return (
                    <div
                      key={o.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {o.id}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[11px] font-semibold border rounded ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 mt-1">
                            {o.appName} ({o.country}) · Qty {o.quantity}
                          </p>
                          <p className="text-xs text-slate-600">
                            Pembeli: {o.customerName}
                            {o.customerContact ? ` · ${o.customerContact}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                            {formatRupiah(o.totalAmount)}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">
                            {formatDateTime(o.createdAt)}
                          </p>
                        </div>
                      </div>

                      {(o.assignedNumber || o.otpCode) && (
                        <div className="flex flex-wrap items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs">
                          {o.assignedNumber && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(o.assignedNumber, `tnum-${o.id}`)
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-emerald-300 rounded font-mono font-bold text-slate-900"
                            >
                              <span>{o.assignedNumber}</span>
                              {copiedKey === `tnum-${o.id}` ? (
                                <Check className="w-3 h-3 text-emerald-700" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-500" />
                              )}
                            </button>
                          )}
                          {o.otpCode && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(o.otpCode, `totp-${o.id}`)
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-emerald-300 rounded font-mono font-bold text-emerald-800"
                            >
                              <span>OTP: {o.otpCode}</span>
                              {copiedKey === `totp-${o.id}` ? (
                                <Check className="w-3 h-3 text-emerald-700" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-500" />
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <p className="text-xs text-slate-500 truncate">
                          {o.note || 'Tanpa catatan'}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrder(o);
                              setEditOrdNumber(o.assignedNumber);
                              setEditOrdOtp(o.otpCode);
                              setEditOrdNote(o.note);
                              setEditOrdStatus(o.status);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-900 text-white rounded-md"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Input Nomor/OTP</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOrder(o.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 rounded"
                            aria-label="Hapus pesanan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TENANT OWN SERVICES */}
      {tab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveService}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
          >
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>{editingSrvId ? 'Edit Layanan Saya' : 'Tambah Layanan Saya'}</span>
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Aplikasi
              </label>
              <input
                type="text"
                required
                value={srvApp}
                onChange={(e) => setSrvApp(e.target.value)}
                placeholder="WhatsApp / Telegram / Shopee"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Negara
                </label>
                <input
                  type="text"
                  required
                  value={srvCountry}
                  onChange={(e) => setSrvCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kode
                </label>
                <input
                  type="text"
                  required
                  value={srvCode}
                  onChange={(e) => setSrvCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Harga (Rp)
                </label>
                <input
                  type="number"
                  min={500}
                  required
                  value={srvPrice}
                  onChange={(e) => setSrvPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Stok
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={srvStock}
                  onChange={(e) => setSrvStock(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Estimasi Proses
              </label>
              <input
                type="text"
                value={srvTime}
                onChange={(e) => setSrvTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            {srvError && <p className="text-xs text-rose-600">{srvError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={srvBusy}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                {srvBusy ? 'Menyimpan...' : editingSrvId ? 'Perbarui' : 'Simpan Layanan'}
              </button>
              {editingSrvId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSrvId(null);
                    setSrvApp('');
                  }}
                  className="px-3 py-2.5 bg-slate-100 text-xs font-semibold text-slate-700 rounded-lg"
                >
                  Batal
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Daftar Layanan Khusus Penyewa ({workspace.services.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-200">
              {workspace.services.map((srv) => (
                <div
                  key={srv.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {srv.appName} — {srv.country} ({srv.countryCode})
                    </p>
                    <p className="text-xs text-slate-500 font-mono">
                      {formatRupiah(srv.price)} · Stok {srv.stock} · {srv.estimatedTime}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEditService(srv)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded"
                      aria-label="Edit layanan"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteService(srv.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 rounded"
                      aria-label="Hapus layanan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TENANT OWN QRIS & STORE PROFILE */}
      {tab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              QRIS Pembayaran Saya
            </h2>
            {workspace.qrisImageUrl ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-3">
                <img
                  src={workspace.qrisImageUrl}
                  alt="QRIS Penyewa"
                  referrerPolicy="no-referrer"
                  className="w-52 h-52 mx-auto object-contain bg-white border border-slate-200 rounded-lg p-2"
                />
                <p className="text-xs font-semibold text-slate-700">
                  {workspace.qrisMerchantName}
                </p>
                <div className="flex justify-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Ganti QRIS</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadTenantQris}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={qrisUploading}
                    onClick={() => void handleDeleteTenantQris()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 py-10 px-4 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-xl cursor-pointer text-center">
                <QrCode className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">
                  {qrisUploading ? 'Mengunggah...' : 'Unggah QRIS Khusus Anda'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUploadTenantQris}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          <form
            onSubmit={handleSaveTenantSettings}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">
              Profil Toko Khusus Penyewa
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lapak Anda
                </label>
                <input
                  type="text"
                  required
                  value={storeTitle}
                  onChange={(e) => setStoreTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Merchant QRIS Anda
                </label>
                <input
                  type="text"
                  required
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor WhatsApp Anda
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Username Telegram Anda
                </label>
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Instruksi Pembayaran untuk Pembeli Anda
              </label>
              <textarea
                rows={2}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            {settingErr && <p className="text-xs text-rose-600">{settingErr}</p>}
            {settingMsg && <p className="text-xs text-emerald-700">{settingMsg}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={settingBusy}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                {settingBusy ? 'Menyimpan...' : 'Simpan Profil Saya'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Edit Nomor Nokos / OTP Pesanan Penyewa */}
      {editingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveOrderEdit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              Update Pesanan {editingOrder.id}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Status Pesanan
              </label>
              <select
                value={editOrdStatus}
                onChange={(e) => setEditOrdStatus(e.target.value as TenantOrderStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="pending">Menunggu</option>
                <option value="processing">Diproses</option>
                <option value="completed">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nomor Nokos
              </label>
              <input
                type="text"
                value={editOrdNumber}
                onChange={(e) => setEditOrdNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kode OTP
              </label>
              <input
                type="text"
                value={editOrdOtp}
                onChange={(e) => setEditOrdOtp(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan
              </label>
              <input
                type="text"
                value={editOrdNote}
                onChange={(e) => setEditOrdNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 bg-slate-100 text-xs font-semibold text-slate-700 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={ordBusy}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                {ordBusy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
