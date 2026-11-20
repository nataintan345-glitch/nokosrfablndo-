import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import type { NokosOrder, PublicStoreSettings } from '../types';
import {
  buildWaUrl,
  fileToBase64,
  formatDateTime,
  formatRupiah,
  getStatusLabel,
} from '../utils/format';
import { StatusLabel } from './StatusLabel';

interface OrderTrackingModalProps {
  order: NokosOrder;
  settings: PublicStoreSettings;
  onClose: () => void;
  onOrderUpdated: (updated: NokosOrder) => void;
  onStartLiveChat: (orderId: string) => void;
}

export function OrderTrackingModal({
  order,
  settings,
  onClose,
  onOrderUpdated,
  onStartLiveChat,
}: OrderTrackingModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [senderName, setSenderName] = useState(order.paymentSenderName || '');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [checkingOtp, setCheckingOtp] = useState(false);
  const [otpCheckMessage, setOtpCheckMessage] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleSelectProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const encoded = await fileToBase64(file);
      setProofFile(file);
      setProofPreview(encoded.dataBase64);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'File tidak valid.');
    }
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofFile || !proofPreview) {
      setErrorMsg('Pilih foto bukti transfer terlebih dahulu.');
      return;
    }
    if (senderName.trim().length < 2) {
      setErrorMsg('Masukkan nama pengirim / bank / e-wallet.');
      return;
    }
    setUploading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/proof`, {
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
        throw new Error(data.error || 'Gagal mengunggah bukti pembayaran.');
      }
      onOrderUpdated(data.order);
      setProofFile(null);
      setProofPreview(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setUploading(false);
    }
  };

  const handleCheckOtp = async () => {
    setCheckingOtp(true);
    setOtpCheckMessage(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/check-otp`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        order?: NokosOrder;
        message?: string;
        error?: string;
      };
      if (data.order) onOrderUpdated(data.order);
      if (data.message) setOtpCheckMessage(data.message);
      else if (data.error) setOtpCheckMessage(data.error);
    } catch {
      setOtpCheckMessage('Gagal memeriksa OTP masuk.');
    } finally {
      setCheckingOtp(false);
    }
  };

  const handleRequestResend = async () => {
    setCheckingOtp(true);
    setOtpCheckMessage(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.id)}/request-resend`,
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

  const adminWaMessage = [
    `Halo Admin ${settings.storeName}, saya ingin konfirmasi pesanan:`,
    `ID Pesanan: ${order.id}`,
    `Layanan: ${order.appName} (${order.country} ${order.countryCode}) x${order.quantity}`,
    `Total: ${formatRupiah(order.totalAmount)}`,
    `Status: ${getStatusLabel(order.status)}`,
    order.paymentSenderName ? `Pengirim QRIS: ${order.paymentSenderName}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const canUploadProof =
    order.paymentMethod === 'qris' &&
    (order.status === 'awaiting_payment' || order.status === 'rejected');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tracking-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-slate-500">{order.id}</p>
            <h2
              id="tracking-modal-title"
              className="text-lg font-bold text-slate-900"
            >
              Detail & Pelacakan Transaksi
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900">
                {order.appName} — {order.country} ({order.countryCode})
              </p>
              <p className="text-sm text-slate-600">
                {order.customerName} · {order.customerWhatsapp} · Qty {order.quantity}
              </p>
              <p className="text-xs text-slate-500">
                Dibuat {formatDateTime(order.createdAt)} · Metode:{' '}
                {order.paymentMethod === 'balance' ? 'Saldo Akun' : 'QRIS Owner'}
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900">
                {formatRupiah(order.totalAmount)}
              </p>
              <StatusLabel status={order.status} />
            </div>
          </div>

          {(order.assignedNumber || order.otpCode || order.adminNote || order.providerError) && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-emerald-800">
                  Data Nomor Kosong & OTP Asli ({order.appName})
                </p>
                {order.status === 'processing' &&
                  order.assignedNumber &&
                  !order.otpCode && (
                    <button
                      type="button"
                      disabled={checkingOtp}
                      onClick={() => void handleCheckOtp()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-md transition-colors"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${checkingOtp ? 'animate-spin' : ''}`}
                      />
                      <span>{checkingOtp ? 'Mengecek...' : 'Cek OTP Masuk'}</span>
                    </button>
                  )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {order.assignedNumber && (
                  <div className="bg-white border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Nomor Nokos</p>
                      <p className="text-base font-mono font-semibold text-slate-900 truncate tabular-nums">
                        {order.assignedNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(order.assignedNumber || '', 'num')}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
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
                {order.otpCode && (
                  <div className="bg-white border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Kode OTP Masuk</p>
                      <p className="text-base font-mono font-bold text-emerald-700 truncate tabular-nums">
                        {order.otpCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(order.otpCode || '', 'otp')}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
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
                )}
              </div>
              {order.assignedNumber && !order.otpCode && order.status === 'processing' && (
                <p className="text-xs text-emerald-900">
                  Masukkan nomor di atas ke aplikasi <strong>{order.appName}</strong> dan minta SMS verifikasi. OTP asli akan tampil otomatis di sini.
                </p>
              )}
              {order.otpSmsText && (
                <p className="text-xs font-mono text-slate-700 bg-white border border-emerald-200 rounded-md px-3 py-1.5">
                  SMS: {order.otpSmsText}
                </p>
              )}
              {order.otpCode &&
                order.providerActivationId &&
                order.providerMode === 'sms_activate' && (
                  <button
                    type="button"
                    disabled={checkingOtp}
                    onClick={() => void handleRequestResend()}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Minta Kirim Ulang OTP
                  </button>
                )}
              {otpCheckMessage && (
                <p className="text-xs text-slate-700 bg-white rounded-md px-3 py-1.5 border border-emerald-200">
                  {otpCheckMessage}
                </p>
              )}
              {order.providerError && !order.assignedNumber && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                  Catatan sistem: {order.providerError}
                </p>
              )}
              {order.adminNote && (
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Catatan Admin:</span> {order.adminNote}
                </p>
              )}
            </div>
          )}

          {order.status === 'rejected' && order.adminNote && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
              <p className="font-semibold">Pesanan / Pembayaran Ditolak</p>
              <p className="mt-1">{order.adminNote}</p>
            </div>
          )}

          {canUploadProof && (
            <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50/50">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Pembayaran QRIS Resmi Owner
                </h3>
                {settings.qrisImageUrl && (
                  <a
                    href={settings.qrisImageUrl}
                    download={`QRIS-${settings.qrisMerchantName}.png`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" /> Simpan QRIS
                  </a>
                )}
              </div>

              {settings.qrisImageUrl ? (
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <img
                    src={settings.qrisImageUrl}
                    alt={`QRIS ${settings.qrisMerchantName}`}
                    referrerPolicy="no-referrer"
                    onClick={() => setZoomImage(settings.qrisImageUrl)}
                    className="w-44 h-44 object-contain bg-white border border-slate-200 rounded-lg p-2 cursor-zoom-in shrink-0"
                  />
                  <div className="text-sm text-slate-600 space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      {settings.qrisMerchantName}
                    </p>
                    <p>{settings.paymentInstruction}</p>
                    <p className="text-xs text-slate-500">
                      Nominal tepat:{' '}
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatRupiah(order.totalAmount)}
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Owner belum mengunggah foto QRIS. Silakan hubungi admin terlebih dahulu.
                </p>
              )}

              <form onSubmit={handleUploadProof} className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Pengirim / Bank / E-Wallet
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Nama pengirim / bank / e-wallet"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unggah Screenshot Bukti Pembayaran
                  </label>
                  <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-emerald-600 transition-colors text-sm text-slate-700">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span>{proofFile ? proofFile.name : 'Pilih foto struk transfer (PNG/JPG)'}</span>
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
                    alt="Preview bukti bayar"
                    className="h-32 w-auto object-contain rounded-lg border border-slate-200 bg-white p-1"
                  />
                )}
                {errorMsg && <p className="text-xs text-rose-600">{errorMsg}</p>}
                <button
                  type="submit"
                  disabled={uploading || !settings.qrisImageUrl}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {uploading ? 'Mengunggah Bukti...' : 'Kirim Bukti Pembayaran'}
                </button>
              </form>
            </div>
          )}

          {order.paymentProofUrl && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Bukti Pembayaran Terkirim ({order.paymentSenderName || '-'})
              </p>
              <button
                type="button"
                onClick={() => setZoomImage(order.paymentProofUrl)}
                className="group relative inline-block border border-slate-200 rounded-lg overflow-hidden bg-slate-50"
              >
                <img
                  src={order.paymentProofUrl}
                  alt="Bukti pembayaran"
                  referrerPolicy="no-referrer"
                  className="h-36 w-auto object-contain"
                />
                <span className="block text-xs text-slate-600 px-2 py-1 border-t border-slate-200 bg-white">
                  Klik untuk perbesar gambar
                </span>
              </button>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Riwayat & Timeline Status
            </h3>
            <ol className="space-y-3 border-l border-slate-200 ml-2 pl-4">
              {order.timeline.map((item, idx) => (
                <li key={`${item.timestamp}-${idx}`} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {formatDateTime(item.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Oleh {item.actor}
                    {item.note ? ` · ${item.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartLiveChat(order.id);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Live Chat Owner</span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {settings.ownerTelegram && (
                <a
                  href={`https://t.me/${settings.ownerTelegram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  <span>@{settings.ownerTelegram}</span>
                </a>
              )}
              <a
                href={buildWaUrl(settings.ownerWhatsapp, adminWaMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Admin</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <img
            src={zoomImage}
            alt="Pratinjau ukuran penuh"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-lg bg-white p-2"
          />
        </div>
      )}
    </div>
  );
}
