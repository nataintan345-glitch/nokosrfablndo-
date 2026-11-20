import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Lock, LogOut, Megaphone, Menu, MessageSquare, Send, Wrench, X } from 'lucide-react';
import { CustomerAuthModal } from './components/CustomerAuthModal';
import { HistoryView } from './components/HistoryView';
import { LiveChatView } from './components/LiveChatView';
import { OwnerDashboardView } from './components/OwnerDashboardView';
import { StorefrontView } from './components/StorefrontView';
import type {
  BroadcastAnnouncement,
  ChatMessage,
  ChatThread,
  NokosOrder,
  NokosService,
  PublicBootstrapResponse,
  PublicCustomerUser,
  PublicRentalLockState,
  PublicStoreOperationState,
  PublicStoreSettings,
  TopUpRequest,
  WalletTransaction,
} from './types';
import { buildWaUrl, formatDateTime, formatRupiah } from './utils/format';

type ActivePage = 'order' | 'history' | 'chat' | 'owner';

const MY_ORDER_IDS_KEY = 'nokos_my_order_ids';
const USER_TOKEN_KEY = 'nokos_user_token';

function readStoredOrderIds(): string[] {
  try {
    const raw = localStorage.getItem(MY_ORDER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveStoredOrderId(id: string): string[] {
  const existing = readStoredOrderIds();
  const next = [id, ...existing.filter((x) => x !== id)].slice(0, 50);
  try {
    localStorage.setItem(MY_ORDER_IDS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export default function App() {
  const [page, setPage] = useState<ActivePage>(() => {
    if (
      window.location.hash === '#owner' ||
      window.location.pathname === '/owner'
    ) {
      return 'owner';
    }
    if (window.location.hash === '#riwayat') return 'history';
    if (window.location.hash === '#chat') return 'chat';
    return 'order';
  });
  const [isOwnerLoggedIn, setIsOwnerLoggedIn] = useState<boolean>(() =>
    Boolean(sessionStorage.getItem('nokos_owner_token'))
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [services, setServices] = useState<NokosService[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastAnnouncement[]>([]);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<PublicStoreSettings>({
    storeName: 'nokosrfablndo',
    ownerWhatsapp: '',
    ownerTelegram: '',
    qrisImageUrl: null,
    qrisMerchantName: 'nokosrfablndo Official',
    paymentInstruction:
      'Scan QRIS sesuai nominal total pesanan, lalu unggah bukti pembayaran.',
    whatsappMode: 'direct',
  });
  const [rentalLock, setRentalLock] = useState<PublicRentalLockState>({
    locked: false,
    reason: '',
    expiresAt: null,
    activeTenantName: null,
  });
  const [storeOperation, setStoreOperation] = useState<PublicStoreOperationState>({
    mode: 'open',
    effectiveMode: 'open',
    autoBySchedule: false,
    openDays: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
    openTime: '08:00',
    closeTime: '22:00',
    scheduleSummary: 'Setiap Hari (Senin - Minggu) · 08:00 - 22:00 WIB',
    activeDescription:
      'Layanan aktif & siap proses nomor kosong beserta OTP SMS secara real-time.',
    openDescription:
      'Layanan aktif & siap proses nomor kosong beserta OTP SMS secara real-time.',
    closeDescription:
      'Toko sedang tutup di luar jam operasional. Pesanan baru akan dibuka kembali sesuai jadwal.',
    maintenanceDescription:
      'Website sedang dalam pemeliharaan & peningkatan keamanan sistem. Silakan kembali beberapa saat lagi.',
    updatedAt: '',
  });
  const [ownerInitialized, setOwnerInitialized] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Customer Auth & Wallet state
  const [userToken, setUserToken] = useState<string | null>(() =>
    sessionStorage.getItem(USER_TOKEN_KEY)
  );
  const [customerUser, setCustomerUser] = useState<PublicCustomerUser | null>(null);
  const [topups, setTopups] = useState<TopUpRequest[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Orders & Chat state
  const [myOrderIds, setMyOrderIds] = useState<string[]>(() => readStoredOrderIds());
  const [trackedOrders, setTrackedOrders] = useState<NokosOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [prefillChatOrderId, setPrefillChatOrderId] = useState<string | null>(null);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchPublicStore = useCallback(async () => {
    try {
      const res = await fetch('/api/public/store');
      if (!res.ok) return;
      const data = (await res.json()) as PublicBootstrapResponse;
      setServices(data.services);
      setSettings(data.settings);
      setBroadcasts(data.broadcasts || []);
      setOwnerInitialized(data.ownerInitialized);
      if (data.rentalLock) {
        setRentalLock(data.rentalLock);
      }
      if (data.operation) {
        setStoreOperation(data.operation);
      }
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const fetchCustomerSessionData = useCallback(async (token: string) => {
    try {
      const [meRes, chatRes] = await Promise.all([
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/chat/threads', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (meRes.status === 401) {
        sessionStorage.removeItem(USER_TOKEN_KEY);
        setUserToken(null);
        setCustomerUser(null);
        setTopups([]);
        setWalletTransactions([]);
        setChatThreads([]);
        return;
      }
      if (meRes.ok) {
        const meData = (await meRes.json()) as {
          user: PublicCustomerUser;
          topups: TopUpRequest[];
          walletTransactions: WalletTransaction[];
          orders: NokosOrder[];
        };
        setCustomerUser(meData.user);
        setTopups(meData.topups || []);
        setWalletTransactions(meData.walletTransactions || []);
        if (meData.orders?.length) {
          setTrackedOrders((prev) => {
            const byId = new Map(prev.map((o) => [o.id, o]));
            for (const o of meData.orders) {
              byId.set(o.id, o);
            }
            return Array.from(byId.values()).sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt)
            );
          });
        }
      }
      if (chatRes.ok) {
        const chatData = (await chatRes.json()) as { threads: ChatThread[] };
        setChatThreads(chatData.threads || []);
      }
    } catch {
      // Ignore transient error
    }
  }, []);

  const fetchTrackedOrders = useCallback(
    async (ids: string[], query = '', token: string | null = userToken) => {
      if (ids.length === 0 && !query && !token) {
        setTrackedOrders([]);
        return;
      }
      setHistoryLoading(true);
      try {
        const params = new URLSearchParams();
        if (ids.length > 0) params.set('ids', ids.join(','));
        if (query) params.set('q', query);
        const res = await fetch(`/api/orders/track?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { orders: NokosOrder[] };
        setTrackedOrders(data.orders);
      } finally {
        setHistoryLoading(false);
      }
    },
    [userToken]
  );

  useEffect(() => {
    void fetchPublicStore();
  }, [fetchPublicStore]);

  useEffect(() => {
    const onHashChange = () => {
      if (
        window.location.hash === '#owner' ||
        window.location.pathname === '/owner'
      ) {
        setPage('owner');
      } else if (window.location.hash === '#riwayat') {
        setPage('history');
      } else if (window.location.hash === '#chat') {
        setPage('chat');
      } else if (window.location.hash === '#order') {
        setPage('order');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (userToken) {
      void fetchCustomerSessionData(userToken);
    }
  }, [userToken, fetchCustomerSessionData]);

  useEffect(() => {
    void fetchTrackedOrders(myOrderIds, '', userToken);
  }, [fetchTrackedOrders, myOrderIds, userToken]);

  // Persistent Customer WebSocket (/ws) for real-time order, wallet, top-up & live chat sync
  useEffect(() => {
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({ role: 'customer' });
      if (userToken) params.set('token', userToken);
      if (myOrderIds.length > 0) params.set('orderIds', myOrderIds.join(','));

      const ws = new WebSocket(`${proto}//${window.location.host}/ws?${params.toString()}`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data as string) as {
            event: string;
            payload: unknown;
          };

          if (parsed.event === 'order:update') {
            const updated = parsed.payload as NokosOrder;
            setTrackedOrders((prev) => {
              const exists = prev.some((o) => o.id === updated.id);
              return exists
                ? prev.map((o) => (o.id === updated.id ? updated : o))
                : [updated, ...prev];
            });
          } else if (parsed.event === 'topup:update') {
            const topup = parsed.payload as TopUpRequest;
            setTopups((prev) => {
              const exists = prev.some((t) => t.id === topup.id);
              return exists
                ? prev.map((t) => (t.id === topup.id ? topup : t))
                : [topup, ...prev];
            });
          } else if (parsed.event === 'wallet:update') {
            const data = parsed.payload as {
              balance: number;
              transaction?: WalletTransaction;
            };
            setCustomerUser((prev) =>
              prev ? { ...prev, balance: data.balance } : prev
            );
            if (data.transaction) {
              const newTx = data.transaction;
              setWalletTransactions((prev) =>
                prev.some((t) => t.id === newTx.id) ? prev : [newTx, ...prev]
              );
            }
          } else if (parsed.event === 'chat:thread_created') {
            const thread = parsed.payload as ChatThread;
            setChatThreads((prev) =>
              prev.some((t) => t.id === thread.id) ? prev : [thread, ...prev]
            );
          } else if (parsed.event === 'chat:message') {
            const msg = parsed.payload as ChatMessage;
            setChatThreads((prev) =>
              prev
                .map((t) => {
                  if (t.id !== msg.threadId) return t;
                  if (t.messages.some((m) => m.id === msg.id)) return t;
                  return {
                    ...t,
                    updatedAt: msg.createdAt,
                    messages: [...t.messages, msg],
                  };
                })
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            );
          } else if (parsed.event === 'chat:read') {
            const data = parsed.payload as {
              threadId: string;
              readerRole: 'owner' | 'customer';
              messageIds: string[];
              readAt: string;
            };
            const idSet = new Set(data.messageIds);
            setChatThreads((prev) =>
              prev.map((t) => {
                if (t.id !== data.threadId) return t;
                return {
                  ...t,
                  messages: t.messages.map((m) => {
                    if (!idSet.has(m.id)) return m;
                    return data.readerRole === 'owner'
                      ? { ...m, readByOwner: true, readAt: data.readAt }
                      : { ...m, readByCustomer: true, readAt: data.readAt };
                  }),
                };
              })
            );
          } else if (parsed.event === 'chat:closed' || parsed.event === 'chat:rated') {
            const updatedThread = parsed.payload as ChatThread;
            setChatThreads((prev) =>
              prev.map((t) => (t.id === updatedThread.id ? updatedThread : t))
            );
          } else if (parsed.event === 'broadcast:sync') {
            const list = parsed.payload as BroadcastAnnouncement[];
            setBroadcasts(list.filter((b) => b.active));
          } else if (parsed.event === 'store:settings_updated') {
            const updatedSettings = parsed.payload as PublicStoreSettings;
            setSettings(updatedSettings);
          } else if (parsed.event === 'store:operation_updated') {
            const updatedOp = parsed.payload as PublicStoreOperationState;
            setStoreOperation(updatedOp);
            if (updatedOp.effectiveMode === 'maintenance') {
              setFloatingChatOpen(false);
            }
          } else if (parsed.event === 'rental:web_state') {
            const lockPayload = parsed.payload as PublicRentalLockState;
            setRentalLock(lockPayload);
            if (lockPayload.locked) {
              setFloatingChatOpen(false);
              setAuthModalOpen(false);
            }
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [userToken, myOrderIds]);

  const navigateTo = (target: ActivePage) => {
    setPage(target);
    setMobileMenuOpen(false);
    const hashMap: Record<ActivePage, string> = {
      order: '/#order',
      history: '/#riwayat',
      chat: '/#chat',
      owner: '/#owner',
    };
    window.history.replaceState(null, '', hashMap[target]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeOrder = useMemo(
    () => trackedOrders.find((o) => o.id === activeOrderId) || null,
    [trackedOrders, activeOrderId]
  );

  const unreadOwnerReplies = useMemo(
    () =>
      chatThreads.reduce(
        (sum, t) =>
          sum +
          t.messages.filter((m) => m.senderRole === 'owner' && !m.readByCustomer).length,
        0
      ),
    [chatThreads]
  );

  const handleOrderCreated = (order: NokosOrder, updatedBalance?: number) => {
    const nextIds = saveStoredOrderId(order.id);
    setMyOrderIds(nextIds);
    setTrackedOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
    setActiveOrderId(order.id);
    if (typeof updatedBalance === 'number') {
      setCustomerUser((prev) =>
        prev ? { ...prev, balance: updatedBalance } : prev
      );
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'watch_orders', orderIds: [order.id] })
      );
    }
  };

  const handleOrderUpdated = (updated: NokosOrder) => {
    const nextIds = saveStoredOrderId(updated.id);
    setMyOrderIds(nextIds);
    setTrackedOrders((prev) => {
      const exists = prev.some((o) => o.id === updated.id);
      return exists
        ? prev.map((o) => (o.id === updated.id ? updated : o))
        : [updated, ...prev];
    });
  };

  const handleSearchHistory = async (query: string) => {
    await fetchTrackedOrders(myOrderIds, query, userToken);
  };

  const handleUserAuthenticated = async (
    newToken: string,
    user: PublicCustomerUser,
    ownerToken?: string
  ) => {
    sessionStorage.setItem(USER_TOKEN_KEY, newToken);
    setUserToken(newToken);
    setCustomerUser(user);
    if (ownerToken) {
      sessionStorage.setItem('nokos_owner_token', ownerToken);
      setIsOwnerLoggedIn(true);
    }
    await fetchCustomerSessionData(newToken);
    setAuthModalOpen(false);
    if (ownerToken) {
      navigateTo('owner');
    }
  };

  const handleUserLogout = async () => {
    if (userToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
      }).catch(() => {});
    }
    const existingOwnerToken = sessionStorage.getItem('nokos_owner_token');
    if (existingOwnerToken) {
      await fetch('/api/owner/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${existingOwnerToken}` },
      }).catch(() => {});
      sessionStorage.removeItem('nokos_owner_token');
      setIsOwnerLoggedIn(false);
    }
    sessionStorage.removeItem(USER_TOKEN_KEY);
    setUserToken(null);
    setCustomerUser(null);
    setTopups([]);
    setWalletTransactions([]);
    setChatThreads([]);
    setAuthModalOpen(false);
  };

  const handleStartLiveChat = (orderId: string) => {
    setPrefillChatOrderId(orderId);
    setFloatingChatOpen(true);
    if (!customerUser) {
      setAuthModalOpen(true);
    }
  };

  const handleMessagesReadByCustomer = useCallback((threadId: string) => {
    setChatThreads((prev) =>
      prev.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          messages: t.messages.map((m) =>
            m.senderRole === 'owner' ? { ...m, readByCustomer: true } : m
          ),
        };
      })
    );
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Single row, 3 zones */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Brand Wordmark + Order Nokos & Live Chat side by side */}
          <div className="flex items-center gap-2.5 sm:gap-6 min-w-0">
            <button
              type="button"
              onClick={() => navigateTo('order')}
              className="text-sm sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap truncate max-w-[104px] sm:max-w-none shrink-0 cursor-pointer"
            >
              {settings.storeName}
            </button>

            {!rentalLock.locked && (
              <div className="flex items-center gap-2.5 sm:gap-5 text-xs sm:text-sm font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => navigateTo('order')}
                  className={`whitespace-nowrap shrink-0 hover:text-slate-900 hover:underline underline-offset-4 transition-colors ${
                    page === 'order' ? 'text-slate-900 font-semibold underline' : ''
                  }`}
                >
                  Order Nokos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (page === 'owner') {
                      navigateTo('order');
                    }
                    setFloatingChatOpen((prev) => !prev);
                  }}
                  className={`whitespace-nowrap shrink-0 hover:text-slate-900 hover:underline underline-offset-4 transition-colors ${
                    floatingChatOpen || page === 'chat'
                      ? 'text-emerald-700 font-semibold underline'
                      : ''
                  }`}
                >
                  Live Chat{unreadOwnerReplies > 0 ? ` (${unreadOwnerReplies})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('history')}
                  className={`hidden md:inline-block whitespace-nowrap shrink-0 hover:text-slate-900 hover:underline underline-offset-4 transition-colors ${
                    page === 'history' ? 'text-slate-900 font-semibold underline' : ''
                  }`}
                >
                  Riwayat Pesanan
                </button>
                {isOwnerLoggedIn && (
                  <button
                    type="button"
                    onClick={() => navigateTo('owner')}
                    className={`hidden md:inline-block whitespace-nowrap shrink-0 hover:text-slate-900 hover:underline underline-offset-4 transition-colors ${
                      page === 'owner' ? 'text-slate-900 font-semibold underline' : ''
                    }`}
                  >
                    Owner
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Zone 3: Visible Account, Clear Logout Button (OUTSIDE garis tiga) & Mobile Nav Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            {!rentalLock.locked && (
              <>
                {customerUser || isOwnerLoggedIn ? (
                  <>
                    {customerUser && (
                      <button
                        type="button"
                        onClick={() => setAuthModalOpen(true)}
                        className="inline-flex px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums"
                      >
                        <span className="sm:hidden">
                          {formatRupiah(customerUser.balance)}
                        </span>
                        <span className="hidden sm:inline">
                          Saldo {formatRupiah(customerUser.balance)}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleUserLogout()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="inline-flex px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Masuk / Daftar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
                  aria-label="Buka menu navigasi"
                >
                  {mobileMenuOpen ? (
                    <X className="w-5 h-5" />
                  ) : (
                    <Menu className="w-5 h-5" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Nav Drawer (Live Chat & Tombol Keluar TIDAK ditaruh di sini saja) */}
        {mobileMenuOpen && !rentalLock.locked && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
            <button
              type="button"
              onClick={() => navigateTo('history')}
              className="block w-full text-left px-3 py-2 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
            >
              Riwayat & Lacak Pesanan
            </button>
            {isOwnerLoggedIn && (
              <button
                type="button"
                onClick={() => navigateTo('owner')}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
              >
                Owner
              </button>
            )}
            {customerUser && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAuthModalOpen(true);
                }}
                className="block w-full text-left px-3 py-2 text-sm font-semibold text-emerald-700 rounded-lg hover:bg-emerald-50"
              >
                Akun & Isi Saldo ({formatRupiah(customerUser.balance)})
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {page !== 'owner' &&
          !rentalLock.locked &&
          broadcasts.filter((b) => !dismissedBroadcastIds.includes(b.id)).length > 0 && (
            <div className="mb-6 space-y-2.5">
              {broadcasts
                .filter((b) => !dismissedBroadcastIds.includes(b.id))
                .map((b) => {
                  const isUrgent = b.priority === 'urgent';
                  const isImportant = b.priority === 'important';
                  return (
                    <div
                      key={b.id}
                      className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 ${
                        isUrgent
                          ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                          : isImportant
                            ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                            : 'bg-slate-100/90 border-slate-200 text-slate-900'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                            isUrgent
                              ? 'bg-rose-100 text-rose-700'
                              : isImportant
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Megaphone className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            <span
                              className={`font-bold uppercase tracking-wide ${
                                isUrgent
                                  ? 'text-rose-700'
                                  : isImportant
                                    ? 'text-amber-800'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {isUrgent
                                ? 'Pengumuman Darurat'
                                : isImportant
                                  ? 'Pengumuman Penting'
                                  : 'Info Layanan'}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="font-mono text-slate-500 tabular-nums">
                              {formatDateTime(b.updatedAt)}
                            </span>
                          </div>
                          <p className="text-sm font-bold">{b.title}</p>
                          <p className="text-xs leading-relaxed opacity-90 whitespace-pre-wrap">
                            {b.message}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDismissedBroadcastIds((prev) => [...prev, b.id])
                        }
                        className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-black/5 shrink-0"
                        aria-label="Tutup pengumuman"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}

        {initialLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Memuat layanan...
          </div>
        ) : page !== 'owner' && rentalLock.locked ? (
          <div className="max-w-lg mx-auto py-12">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5">
              <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Masa Sewa Website Telah Berakhir
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {rentalLock.reason ||
                    'Akses website sementara dikunci oleh Owner karena masa aktif sewa telah berakhir.'}
                </p>
              </div>
              {(settings.ownerWhatsapp || settings.ownerTelegram) && (
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {settings.ownerWhatsapp && (
                    <a
                      href={buildWaUrl(
                        settings.ownerWhatsapp,
                        `Halo Owner ${settings.storeName}, saya ingin memperpanjang masa sewa website.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Hubungi Owner via WhatsApp
                    </a>
                  )}
                  {settings.ownerTelegram && (
                    <a
                      href={`https://t.me/${settings.ownerTelegram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Telegram @{settings.ownerTelegram}</span>
                    </a>
                  )}
                </div>
              )}
              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => navigateTo('owner')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline"
                >
                  Login Owner Utama
                </button>
              </div>
            </div>
          </div>
        ) : page !== 'owner' && storeOperation.effectiveMode === 'maintenance' ? (
          <div className="max-w-lg mx-auto py-12">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                <Wrench className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <span className="inline-block px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-200 rounded">
                  Mode Maintenance
                </span>
                <h1 className="text-xl font-bold text-slate-900">
                  Website Sedang Dalam Pemeliharaan
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {storeOperation.maintenanceDescription}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Jadwal Operasional Toko</span>
                </p>
                <p className="font-mono">{storeOperation.scheduleSummary}</p>
              </div>
              {(settings.ownerWhatsapp || settings.ownerTelegram) && (
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {settings.ownerWhatsapp && (
                    <a
                      href={buildWaUrl(
                        settings.ownerWhatsapp,
                        `Halo Admin ${settings.storeName}, kapan maintenance selesai?`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Hubungi WhatsApp Admin
                    </a>
                  )}
                  {settings.ownerTelegram && (
                    <a
                      href={`https://t.me/${settings.ownerTelegram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Telegram @{settings.ownerTelegram}</span>
                    </a>
                  )}
                </div>
              )}
              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => navigateTo('owner')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline"
                >
                  Masuk Owner
                </button>
              </div>
            </div>
          </div>
        ) : page === 'order' ? (
          <StorefrontView
            services={services}
            settings={settings}
            operation={storeOperation}
            user={customerUser}
            userToken={userToken}
            activeOrder={activeOrder}
            onOrderCreated={handleOrderCreated}
            onOrderUpdated={handleOrderUpdated}
            onResetActiveOrder={() => setActiveOrderId(null)}
            onOpenHistory={() => navigateTo('history')}
            onOpenWalletModal={() => setAuthModalOpen(true)}
            onStartLiveChat={handleStartLiveChat}
          />
        ) : page === 'history' ? (
          <HistoryView
            orders={trackedOrders}
            settings={settings}
            loading={historyLoading}
            onSearchOrders={handleSearchHistory}
            onRefresh={() => fetchTrackedOrders(myOrderIds, '', userToken)}
            onOrderUpdated={handleOrderUpdated}
            onGoToStore={() => navigateTo('order')}
            onStartLiveChat={handleStartLiveChat}
          />
        ) : page === 'chat' ? (
          <LiveChatView
            user={customerUser}
            userToken={userToken}
            threads={chatThreads}
            orders={trackedOrders}
            prefillOrderId={prefillChatOrderId}
            onClearPrefillOrder={() => setPrefillChatOrderId(null)}
            onRequireAuth={() => setAuthModalOpen(true)}
            onThreadCreated={(t) =>
              setChatThreads((prev) =>
                prev.some((x) => x.id === t.id) ? prev : [t, ...prev]
              )
            }
            onThreadUpdated={(t) =>
              setChatThreads((prev) => prev.map((x) => (x.id === t.id ? t : x)))
            }
            onMessagesReadByCustomer={handleMessagesReadByCustomer}
          />
        ) : (
          <OwnerDashboardView
            ownerInitialized={ownerInitialized}
            onPublicDataChanged={fetchPublicStore}
            onOwnerAuthChange={setIsOwnerLoggedIn}
          />
        )}
      </main>

      {/* Quiet Clean Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            &copy; {new Date().getFullYear()} {settings.storeName}
          </p>
          <div className="flex flex-wrap items-center gap-5">
            {!rentalLock.locked && (
              <>
                <button
                  type="button"
                  onClick={() => navigateTo('history')}
                  className="hover:text-slate-900 transition-colors"
                >
                  Lacak Transaksi
                </button>
                <button
                  type="button"
                  onClick={() => setFloatingChatOpen(true)}
                  className="hover:text-slate-900 transition-colors"
                >
                  Live Chat
                </button>
              </>
            )}
            {settings.ownerTelegram && (
              <a
                href={`https://t.me/${settings.ownerTelegram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-medium transition-colors"
              >
                <Send className="w-3 h-3" />
                <span>Telegram @{settings.ownerTelegram}</span>
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* Floating Live Chat beside Order Nokos */}
      {page !== 'owner' && page !== 'chat' && !rentalLock.locked && (
        <>
          {floatingChatOpen && (
            <div className="fixed bottom-20 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[390px] h-[520px] max-h-[78vh] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <LiveChatView
                compact
                onCloseFloating={() => setFloatingChatOpen(false)}
                user={customerUser}
                userToken={userToken}
                threads={chatThreads}
                orders={trackedOrders}
                prefillOrderId={prefillChatOrderId}
                onClearPrefillOrder={() => setPrefillChatOrderId(null)}
                onRequireAuth={() => setAuthModalOpen(true)}
                onThreadCreated={(t) =>
                  setChatThreads((prev) =>
                    prev.some((x) => x.id === t.id) ? prev : [t, ...prev]
                  )
                }
                onThreadUpdated={(t) =>
                  setChatThreads((prev) => prev.map((x) => (x.id === t.id ? t : x)))
                }
                onMessagesReadByCustomer={handleMessagesReadByCustomer}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setFloatingChatOpen((prev) => !prev)}
            className="fixed bottom-5 right-4 sm:right-6 z-40 inline-flex items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-full shadow-lg border border-slate-700/40 transition-all"
            aria-label="Buka Live Chat"
          >
            {floatingChatOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            )}
            <span>Live Chat</span>
            {unreadOwnerReplies > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-500 text-slate-950 rounded-full">
                {unreadOwnerReplies}
              </span>
            )}
          </button>
        </>
      )}

      {authModalOpen && (
        <CustomerAuthModal
          user={customerUser}
          topups={topups}
          transactions={walletTransactions}
          settings={settings}
          userToken={userToken}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleUserAuthenticated}
          onUserUpdated={(updated) => setCustomerUser(updated)}
          onLogout={handleUserLogout}
          onTopUpCreated={(topup) =>
            setTopups((prev) => [topup, ...prev.filter((t) => t.id !== topup.id)])
          }
        />
      )}
    </div>
  );
}
