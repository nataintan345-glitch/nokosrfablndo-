import { useMemo, useState } from 'react';
import { Check, Copy, Eye, RefreshCw, Search } from 'lucide-react';
import type { NokosOrder, OrderStatus, PublicStoreSettings } from '../types';
import { formatDateTime, formatRupiah } from '../utils/format';
import { OrderTrackingModal } from './OrderTrackingModal';
import { StatusLabel } from './StatusLabel';

interface HistoryViewProps {
  orders: NokosOrder[];
  settings: PublicStoreSettings;
  loading: boolean;
  onSearchOrders: (query: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOrderUpdated: (order: NokosOrder) => void;
  onGoToStore: () => void;
  onStartLiveChat: (orderId: string) => void;
}

const STATUS_FILTERS: { value: 'all' | OrderStatus; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'awaiting_payment', label: 'Belum Bayar' },
  { value: 'pending_verification', label: 'Verifikasi' },
  { value: 'processing', label: 'Diproses' },
  { value: 'completed', label: 'Selesai' },
  { value: 'rejected', label: 'Ditolak' },
];

export function HistoryView({
  orders,
  settings,
  loading,
  onSearchOrders,
  onRefresh,
  onOrderUpdated,
  onGoToStore,
  onStartLiveChat,
}: HistoryViewProps) {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const filteredOrders = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.customerWhatsapp.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.appName.toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, searchText]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSearchOrders(searchText.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            Riwayat & Pelacakan Pesanan
          </h1>
          <p className="text-sm text-slate-600">
            Cari transaksi Anda dengan Kode Pesanan atau Nomor Aktif untuk melihat status, nomor Nokos, dan kode OTP.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full lg:max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Kode pesanan atau nomor aktif..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Lacak
          </button>
        </form>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === f.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List / Table */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-base font-semibold text-slate-900">
            Belum ada riwayat pesanan yang cocok
          </p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Pesanan Anda otomatis muncul di sini, atau masukkan Kode Pesanan / Nomor Aktif di kolom pencarian.
          </p>
          <button
            type="button"
            onClick={onGoToStore}
            className="inline-flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Buat Pesanan Baru
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode & Waktu</th>
                  <th className="py-3 px-4">Layanan</th>
                  <th className="py-3 px-4">Nomor / OTP</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 align-top">
                      <p className="font-mono font-semibold text-slate-900">
                        {order.id}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <p className="font-medium text-slate-900">
                        {order.appName} · {order.country} ({order.countryCode})
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Qty {order.quantity} · {order.customerName}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      {order.assignedNumber ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {order.assignedNumber}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(
                                  order.assignedNumber || '',
                                  `num-${order.id}`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors shrink-0"
                            >
                              {copiedKey === `num-${order.id}` ? (
                                <>
                                  <Check className="w-3 h-3" /> Disalin
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Salin
                                </>
                              )}
                            </button>
                          </div>
                          {order.otpCode && (
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                                OTP: {order.otpCode}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopy(order.otpCode || '', `otp-${order.id}`)
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors shrink-0"
                              >
                                {copiedKey === `otp-${order.id}` ? (
                                  <>
                                    <Check className="w-3 h-3" /> Disalin
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" /> Salin
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Menunggu proses</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 align-top text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatRupiah(order.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <StatusLabel status={order.status} />
                    </td>
                    <td className="py-3.5 px-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {order.status === 'awaiting_payment' ||
                          order.status === 'rejected'
                            ? 'Bayar / Detail'
                            : 'Detail & Lacak'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderTrackingModal
          order={selectedOrder}
          settings={settings}
          onClose={() => setSelectedOrderId(null)}
          onOrderUpdated={onOrderUpdated}
          onStartLiveChat={onStartLiveChat}
        />
      )}
    </div>
  );
}
