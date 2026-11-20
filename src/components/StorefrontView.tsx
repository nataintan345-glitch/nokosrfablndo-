import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Lock,
  MessageCircle,
  MessageSquare,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Upload,
  Wallet,
} from 'lucide-react';
import type {
  NokosOrder,
  NokosService,
  OrderPaymentMethod,
  PublicCustomerUser,
  PublicStoreOperationState,
  PublicStoreSettings,
} from '../types';
import {
  buildWaUrl,
  fileToBase64,
  formatDateTime,
  formatRupiah,
  getStatusLabel,
} from '../utils/format';
import { StatusLabel } from './StatusLabel';

interface StorefrontViewProps {
  services: NokosService[];
  settings: PublicStoreSettings;
  operation: PublicStoreOperationState;
  user: PublicCustomerUser | null;
  userToken: string | null;
  activeOrder: NokosOrder | null;
  onOrderCreated: (order: NokosOrder, updatedBalance?: number) => void;
  onOrderUpdated: (order: NokosOrder) => void;
  onResetActiveOrder: () => void;
  onOpenHistory: () => void;
  onOpenWalletModal: () => void;
  onStartLiveChat: (orderId: string) => void;
}

export function StorefrontView({
  services,
  settings,
  operation,
  user,
  userToken,
  activeOrder,
  onOrderCreated,
  onOrderUpdated,
  onResetActiveOrder,
  onOpenHistory,
  onOpenWalletModal,
  onStartLiveChat,
}: StorefrontViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [appFilter, setAppFilter] = useState('Semua');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    services[0]?.id || ''
  );
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('qris');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerWhatsapp, setCustomerWhatsapp] = useState(user?.whatsapp || '');
  const [customerNote, setCustomerNote] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Payment proof upload state
  const [senderName, setSenderName] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [checkingOtp, setCheckingOtp] = useState(false);
  const [otpCheckMessage, setOtpCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name);
      setCustomerWhatsapp((prev) => prev || user.whatsapp);
    }
  }, [user]);

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.id === selectedServiceId)) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  const appCategories = useMemo(() => {
    const names = Array.from(new Set(services.map((s) => s.appName)));
    return ['Semua', ...names.slice(0, 6)];
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return services.filter((srv) => {
      if (appFilter !== 'Semua' && srv.appName !== appFilter) return false;
      if (!q) return true;
      return (
        srv.appName.toLowerCase().includes(q) ||
        srv.country.toLowerCase().includes(q) ||
        srv.countryCode.toLowerCase().includes(q)
      );
    });
  }, [services, appFilter, searchQuery]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const totalAmount = selectedService ? selectedService.price * quantity : 0;
  const hasEnoughBalance = user ? user.balance >= totalAmount : false;

  const handleSelectService = (srv: NokosService) => {
    setSelectedServiceId(srv.id);
    setQuantity(1);
    setOrderError(null);
  };

  const isStoreOpen = operation.effectiveMode === 'open';

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStoreOpen) {
      setOrderError(
        operation.activeDescription ||
          'Toko sedang tutup sementara sesuai jadwal operasional.'
      );
      return;
    }
    if (!selectedService) {
      setOrderError('Pilih layanan Nokos terlebih dahulu.');
      return;
    }
    if (paymentMethod === 'balance' && !user) {
      onOpenWalletModal();
      return;
    }
    setSubmittingOrder(true);
    setOrderError(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (userToken) {
        headers.Authorization = `Bearer ${userToken}`;
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceId: selectedService.id,
          quantity,
          paymentMethod,
          customerName: customerName.trim(),
          customerWhatsapp: customerWhatsapp.trim(),
          customerNote: customerNote.trim(),
        }),
      });
      const data = (await res.json()) as {
        order?: NokosOrder;
        updatedBalance?: number;
        error?: string;
      };
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Gagal membuat pesanan.');
      }
      setSenderName(customerName.trim());
      setProofFile(null);
      setProofPreview(null);
      setProofError(null);
      onOrderCreated(data.order, data.updatedBalance);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Gagal membuat pesanan.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSelectProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofError(null);
    try {
      const encoded = await fileToBase64(file);
      setProofFile(file);
      setProofPreview(encoded.dataBase64);
    } catch (err) {
      setProofError(err instanceof Error ? err.message : 'File gambar tidak valid.');
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    if (!proofFile || !proofPreview) {
      setProofError('Pilih screenshot bukti pembayaran terlebih dahulu.');
      return;
    }
    if (senderName.trim().length < 2) {
      setProofError('Isi nama pengirim / e-wallet / rekening.');
      return;
    }
    setUploadingProof(true);
    setProofError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(activeOrder.id)}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataBase64: proofPreview,
          mimeType: proofFile.type,
          paymentSenderName: senderName.trim(),
        }),
      });
      const data = (await res.json()) as { order?: NokosOrder; error?: string };
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Gagal mengirim bukti pembayaran.');
      }
      setProofFile(null);
      setProofPreview(null);
      onOrderUpdated(data.order);
    } catch (err) {
      setProofError(err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran.');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCheckOtp = async () => {
    if (!activeOrder) return;
    setCheckingOtp(true);
    setOtpCheckMessage(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(activeOrder.id)}/check-otp`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        order?: NokosOrder;
        message?: string;
        error?: string;
      };
      if (data.order) {
        onOrderUpdated(data.order);
      }
      if (data.message) {
        setOtpCheckMessage(data.message);
      } else if (data.error) {
        setOtpCheckMessage(data.error);
      }
    } catch {
      setOtpCheckMessage('Gagal memeriksa OTP. Coba sesaat lagi.');
    } finally {
      setCheckingOtp(false);
    }
  };

  const handleRequestResend = async () => {
    if (!activeOrder) return;
    setCheckingOtp(true);
    setOtpCheckMessage(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(activeOrder.id)}/request-resend`,
        { method: 'POST' }
      );
      const data = (await res.json()) as {
        order?: NokosOrder;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setOtpCheckMessage(data.error || 'Gagal meminta OTP ulang.');
        return;
      }
      if (data.order) onOrderUpdated(data.order);
      if (data.message) setOtpCheckMessage(data.message);
    } catch {
      setOtpCheckMessage('Gagal menghubungi server.');
    } finally {
      setCheckingOtp(false);
    }
  };

  const buildCustomerConfirmationWa = (order: NokosOrder) => {
    const msg = [
      `Halo Admin ${settings.storeName}, saya ingin konfirmasi pesanan:`,
      `Kode Pesanan: ${order.id}`,
      `Layanan: ${order.appName} (${order.country} ${order.countryCode}) x${order.quantity}`,
      `Total: ${formatRupiah(order.totalAmount)}`,
      order.paymentSenderName ? `Pengirim: ${order.paymentSenderName}` : '',
      `Status: ${getStatusLabel(order.status)}`,
      'Mohon segera diproses. Terima kasih.',
    ]
      .filter(Boolean)
      .join('\n');
    return buildWaUrl(settings.ownerWhatsapp, msg);
  };

  return (
    <div className="space-y-12">
      {/* Compact Storefront Intro */}
      <section className="pt-1 pb-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Order Nomor Kosong
          </h1>
          <p className="text-sm text-slate-600">
            Pilih aplikasi dan negara, bayar lewat saldo atau QRIS, dan terima nomor beserta kode OTP secara real-time.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-5 shrink-0">
          {user ? (
            <>
              <div>
                <p className="text-xs text-slate-500">
                  Masuk sebagai <span className="font-semibold text-slate-800">{user.name}</span>
                </p>
                <p className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                  Saldo {formatRupiah(user.balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenWalletModal}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                + Isi Saldo
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Akun & Saldo Pelanggan
                </p>
                <p className="text-xs text-slate-500">
                  Daftar/masuk untuk isi saldo & live chat owner
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenWalletModal}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Masuk / Daftar
              </button>
            </>
          )}
        </div>
      </section>

      {/* Store Operational Hours, Days & Open/Close Description */}
      <section
        aria-label="Status Operasional Toko"
        className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
          isStoreOpen
            ? 'bg-emerald-50/70 border-emerald-200'
            : 'bg-amber-50 border-amber-300'
        }`}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold rounded-md ${
                isStoreOpen
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-700 text-white'
              }`}
            >
              {isStoreOpen ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>{isStoreOpen ? 'OPEN · BUKA' : 'CLOSE · TUTUP'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-600" />
              <span>{operation.scheduleSummary}</span>
            </span>
          </div>
          <p
            className={`text-xs leading-relaxed ${
              isStoreOpen ? 'text-emerald-950' : 'text-amber-950 font-medium'
            }`}
          >
            {operation.activeDescription}
          </p>
        </div>
        <div className="text-[11px] font-mono text-slate-600 shrink-0 md:text-right">
          <p className="font-semibold text-slate-800">
            Jam Buka: {operation.openTime} - {operation.closeTime} WIB
          </p>
          <p>
            {operation.autoBySchedule
              ? 'Jadwal otomatis WIB aktif'
              : 'Status diatur langsung Owner'}
          </p>
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Nokos Catalog */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              1. Pilih Layanan Nokos
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari aplikasi atau negara..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {appCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setAppFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  appFilter === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredServices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                Layanan tidak ditemukan
              </p>
              <p className="text-sm text-slate-500">
                Coba ubah kata kunci pencarian atau pilih kategori lain.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredServices.map((srv) => {
                const isSelected = selectedServiceId === srv.id && !activeOrder;
                const outOfStock = srv.stock <= 0;
                return (
                  <button
                    key={srv.id}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => {
                      if (activeOrder) onResetActiveOrder();
                      handleSelectService(srv);
                    }}
                    className={`text-left bg-white rounded-xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                      outOfStock
                        ? 'border-slate-200 opacity-55 cursor-not-allowed'
                        : isSelected
                          ? 'border-emerald-600 ring-1 ring-emerald-600'
                          : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {srv.appName}
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0">
                          {formatRupiah(srv.price)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {srv.country} ({srv.countryCode}) ·{' '}
                        {outOfStock ? 'Stok Habis' : `Stok ${srv.stock}`} · {srv.estimatedTime}
                      </p>
                      {srv.description && (
                        <p className="text-xs text-slate-600 line-clamp-2 pt-0.5">
                          {srv.description}
                        </p>
                      )}
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span
                        className={
                          isSelected
                            ? 'font-semibold text-emerald-700'
                            : outOfStock
                              ? 'text-slate-400'
                              : 'font-medium text-slate-600'
                        }
                      >
                        {outOfStock
                          ? 'Tidak Tersedia'
                          : isSelected
                            ? 'Terpilih'
                            : 'Pilih Layanan'}
                      </span>
                      <span className="text-slate-400 font-mono">{srv.countryCode}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Checkout / QRIS Payment / Live Tracker */}
        <div className="lg:col-span-5 lg:sticky lg:top-20">
          {!activeOrder ? (
            <form
              onSubmit={handleCreateOrder}
              className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
            >
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-900">
                  2. Detail Pesanan
                </h2>
                {selectedService && (
                  <span className="text-xs font-mono font-semibold text-slate-700">
                    {selectedService.countryCode}
                  </span>
                )}
              </div>

              {selectedService ? (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedService.appName} — {selectedService.country}
                    </p>
                    <p className="text-xs text-slate-500">
                      Harga satuan {formatRupiah(selectedService.price)} · Stok {selectedService.stock}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded"
                      aria-label="Kurangi jumlah"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-mono font-semibold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((q) =>
                          Math.min(Math.min(10, selectedService.stock), q + 1)
                        )
                      }
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded"
                      aria-label="Tambah jumlah"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Pilih layanan di sebelah kiri untuk memulai pesanan.
                </p>
              )}

              {/* Payment Method Choice: QRIS Owner vs Account Balance */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('qris')}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      paymentMethod === 'qris'
                        ? 'border-emerald-600 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                      <span>QRIS Owner</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Scan QRIS resmi & kirim bukti
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('balance')}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      paymentMethod === 'balance'
                        ? 'border-emerald-600 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Saldo Akun</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                      {user ? formatRupiah(user.balance) : 'Perlu masuk akun'}
                    </p>
                  </button>
                </div>

                {paymentMethod === 'balance' && user && !hasEnoughBalance && (
                  <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
                    <span>Saldo belum mencukupi ({formatRupiah(user.balance)}).</span>
                    <button
                      type="button"
                      onClick={onOpenWalletModal}
                      className="font-semibold underline whitespace-nowrap"
                    >
                      Isi Saldo
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3.5">
                <div>
                  <label
                    htmlFor="cust-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nama atau Username
                  </label>
                  <input
                    id="cust-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Masukkan nama atau username"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cust-wa"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nomor Aktif
                  </label>
                  <input
                    id="cust-wa"
                    type="tel"
                    required
                    value={customerWhatsapp}
                    onChange={(e) => setCustomerWhatsapp(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cust-note"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Catatan Tambahan (Opsional)
                  </label>
                  <input
                    id="cust-note"
                    type="text"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Catatan untuk admin (opsional)"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Pembayaran</span>
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                  {formatRupiah(totalAmount)}
                </span>
              </div>

              {!isStoreOpen && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>Pemesanan Ditutup Sementara</span>
                  </p>
                  <p>{operation.activeDescription}</p>
                  <p className="font-mono text-[11px] text-amber-800">
                    Jadwal: {operation.scheduleSummary}
                  </p>
                </div>
              )}

              {orderError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  {orderError}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  !isStoreOpen ||
                  submittingOrder ||
                  !selectedService ||
                  selectedService.stock <= 0 ||
                  (paymentMethod === 'balance' && Boolean(user) && !hasEnoughBalance)
                }
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {!isStoreOpen
                  ? 'Toko Sedang Tutup'
                  : submittingOrder
                    ? 'Memproses Pesanan...'
                    : paymentMethod === 'balance'
                      ? user
                        ? 'Bayar Sekarang Pakai Saldo'
                        : 'Masuk untuk Bayar Pakai Saldo'
                      : 'Buat Pesanan & Tampilkan QRIS'}
              </button>
            </form>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
              {/* Active Order Header */}
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <p className="text-xs font-mono text-slate-500">
                    {activeOrder.id}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeOrder.appName} — {activeOrder.country}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Qty {activeOrder.quantity} · {activeOrder.customerWhatsapp}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                    {formatRupiah(activeOrder.totalAmount)}
                  </p>
                  <StatusLabel status={activeOrder.status} />
                </div>
              </div>

              {/* Awaiting Payment OR Rejected -> Show Owner QRIS & Proof Upload */}
              {(activeOrder.status === 'awaiting_payment' ||
                activeOrder.status === 'rejected') && (
                <div className="space-y-4">
                  {activeOrder.status === 'rejected' && activeOrder.adminNote && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 space-y-1">
                      <p className="font-semibold">Bukti Pembayaran Ditolak:</p>
                      <p>{activeOrder.adminNote}</p>
                    </div>
                  )}

                  {settings.qrisImageUrl ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-center">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {settings.qrisMerchantName}
                        </span>
                        <a
                          href={settings.qrisImageUrl}
                          download={`QRIS-${settings.qrisMerchantName}.png`}
                          className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" /> Simpan QRIS
                        </a>
                      </div>
                      <img
                        src={settings.qrisImageUrl}
                        alt={`QRIS ${settings.qrisMerchantName}`}
                        referrerPolicy="no-referrer"
                        className="w-56 h-56 mx-auto object-contain bg-white border border-slate-200 rounded-lg p-2"
                      />
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {settings.paymentInstruction}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1.5 text-xs text-amber-800">
                      <div className="flex items-center gap-2 font-semibold">
                        <QrCode className="w-4 h-4 shrink-0" />
                        <span>Pembayaran QRIS Belum Tersedia</span>
                      </div>
                      <p>
                        QRIS pembayaran sedang disiapkan oleh admin. Silakan hubungi admin melalui Live Chat untuk bantuan lebih lanjut.
                      </p>
                    </div>
                  )}

                  <form onSubmit={handleSubmitProof} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama Pengirim / Bank / E-Wallet
                      </label>
                      <input
                        type="text"
                        required
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Nama pengirim / bank / e-wallet"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Upload Bukti Transfer (Screenshot)
                      </label>
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-emerald-600 transition-colors text-xs font-medium text-slate-700">
                        <Upload className="w-4 h-4 text-slate-500" />
                        <span className="truncate">
                          {proofFile
                            ? proofFile.name
                            : 'Pilih foto bukti transfer (PNG / JPG)'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleSelectProof}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    {proofPreview && (
                      <img
                        src={proofPreview}
                        alt="Pratinjau bukti bayar"
                        className="h-32 w-auto mx-auto object-contain rounded-lg border border-slate-200 p-1"
                      />
                    )}
                    {proofError && (
                      <p className="text-xs text-rose-600">{proofError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={uploadingProof || !settings.qrisImageUrl}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      {uploadingProof
                        ? 'Mengirim Bukti...'
                        : 'Kirim Bukti Pembayaran'}
                    </button>
                  </form>
                </div>
              )}

              {/* Pending Verification / Processing / Completed -> Live Status */}
              {(activeOrder.status === 'pending_verification' ||
                activeOrder.status === 'processing' ||
                activeOrder.status === 'completed') && (
                <div className="space-y-4">
                  {activeOrder.status === 'pending_verification' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-800 space-y-1">
                      <p className="font-semibold">
                        Bukti Pembayaran Diterima — Menunggu Verifikasi Admin
                      </p>
                      <p>
                        Halaman ini diperbarui otomatis secara real-time begitu admin memverifikasi pembayaran dan mengirim nomor Anda.
                      </p>
                    </div>
                  )}

                  {activeOrder.status === 'processing' && !activeOrder.assignedNumber && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 text-xs text-emerald-900 space-y-1">
                      <p className="font-semibold">
                        Pembayaran Terkonfirmasi — Menyiapkan Nomor Asli {activeOrder.appName}
                      </p>
                      <p>
                        {activeOrder.providerError
                          ? `Sedang menindaklanjuti ketersediaan nomor (${activeOrder.providerError}). Anda dapat menghubungi Owner melalui Live Chat.`
                          : 'Nomor virtual asli sedang disiapkan dan akan langsung muncul di sini secara real-time.'}
                      </p>
                    </div>
                  )}

                  {(activeOrder.assignedNumber || activeOrder.otpCode) && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-emerald-800">
                          Nomor Nokos & OTP Asli ({activeOrder.appName})
                        </p>
                        {activeOrder.status === 'processing' &&
                          activeOrder.assignedNumber &&
                          !activeOrder.otpCode && (
                            <button
                              type="button"
                              disabled={checkingOtp}
                              onClick={() => void handleCheckOtp()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-md transition-colors"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${checkingOtp ? 'animate-spin' : ''}`}
                              />
                              <span>{checkingOtp ? 'Mengecek...' : 'Cek OTP Masuk'}</span>
                            </button>
                          )}
                      </div>
                      {activeOrder.assignedNumber && (
                        <div className="bg-white border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-slate-500">Nomor Kosong</p>
                            <p className="text-base font-mono font-bold text-slate-900 tabular-nums">
                              {activeOrder.assignedNumber}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(activeOrder.assignedNumber || '', 'num')
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md inline-flex items-center gap-1.5 transition-colors shrink-0"
                          >
                            {copiedKey === 'num' ? (
                              <>
                                <Check className="w-3.5 h-3.5" /> Disalin
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" /> Salin
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {activeOrder.assignedNumber && !activeOrder.otpCode && (
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          Masukkan nomor di atas ke aplikasi <strong>{activeOrder.appName}</strong> untuk meminta kode verifikasi SMS. OTP asli yang masuk akan tampil otomatis di sini.
                        </p>
                      )}
                      {activeOrder.otpCode && (
                        <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs text-slate-500">Kode OTP Masuk</p>
                              <p className="text-base font-mono font-bold text-emerald-700 tabular-nums">
                                {activeOrder.otpCode}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(activeOrder.otpCode || '', 'otp')
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md inline-flex items-center gap-1.5 transition-colors shrink-0"
                            >
                              {copiedKey === 'otp' ? (
                                <>
                                  <Check className="w-3.5 h-3.5" /> Disalin
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" /> Salin
                                </>
                              )}
                            </button>
                          </div>
                          {activeOrder.otpSmsText && (
                            <p className="text-[11px] font-mono text-slate-600 bg-slate-50 rounded px-2 py-1">
                              SMS: {activeOrder.otpSmsText}
                            </p>
                          )}
                          {activeOrder.providerActivationId &&
                            activeOrder.providerMode === 'sms_activate' && (
                              <button
                                type="button"
                                disabled={checkingOtp}
                                onClick={() => void handleRequestResend()}
                                className="text-[11px] font-semibold text-emerald-700 hover:underline"
                              >
                                Minta Kirim Ulang OTP
                              </button>
                            )}
                        </div>
                      )}
                      {otpCheckMessage && (
                        <p className="text-xs text-slate-700 bg-white/80 rounded px-2.5 py-1.5">
                          {otpCheckMessage}
                        </p>
                      )}
                      {activeOrder.adminNote && (
                        <p className="text-xs text-slate-700">
                          Catatan Admin: {activeOrder.adminNote}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-slate-700">
                      Aktivitas Terakhir
                    </p>
                    <ul className="space-y-2 text-xs text-slate-600">
                      {activeOrder.timeline.slice(-3).map((t, i) => (
                        <li
                          key={`${t.timestamp}-${i}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{t.label}</span>
                          <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                            {formatDateTime(t.timestamp)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Footer Actions: Live Chat Owner (with Order ID) + WhatsApp + Telegram */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onStartLiveChat(activeOrder.id)}
                    className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Live Chat Owner</span>
                  </button>
                  <a
                    href={buildCustomerConfirmationWa(activeOrder)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp Admin</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {settings.ownerTelegram && (
                  <a
                    href={`https://t.me/${settings.ownerTelegram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-sky-600" />
                    <span>Telegram Resmi Owner (@{settings.ownerTelegram})</span>
                    <ExternalLink className="w-3 h-3 text-sky-600" />
                  </a>
                )}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onOpenHistory}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline"
                  >
                    Lihat Semua Riwayat Pesanan
                  </button>
                  <button
                    type="button"
                    onClick={onResetActiveOrder}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    + Buat Pesanan Baru
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
