import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  Monitor,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Unlock,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import type {
  BroadcastAnnouncement,
  BroadcastPriority,
  ChatMessage,
  ChatThread,
  DashboardRole,
  NokosOrder,
  NokosProviderMode,
  NokosService,
  OrderStatus,
  OwnerBootstrapResponse,
  OwnerSettings,
  PublicCustomerUser,
  PublicOwnerSession,
  PublicRentalAccount,
  PublicRentalLockState,
  PublicStoreOperationState,
  RentalControlSettings,
  SecurityAuditLog,
  StoreOperationMode,
  StoreOperationSettings,
  TopUpRequest,
  WalletTransaction,
  WeekdayCode,
  WhatsAppMode,
  WhatsAppNotifLog,
} from '../types';
import {
  buildWaUrl,
  fileToBase64,
  formatDateTime,
  formatRupiah,
  getStatusLabel,
  playNotificationChime,
} from '../utils/format';
import { OwnerAnalyticsCharts } from './OwnerAnalyticsCharts';
import { StatusLabel } from './StatusLabel';

const OWNER_AVATAR_URL =
  '/assets/aistudio/file_000000002cf4820787354e496d9bf8db_a88dfc17.png';

const ALL_WEEKDAYS: { code: WeekdayCode; label: string }[] = [
  { code: 'Sen', label: 'Senin' },
  { code: 'Sel', label: 'Selasa' },
  { code: 'Rab', label: 'Rabu' },
  { code: 'Kam', label: 'Kamis' },
  { code: 'Jum', label: 'Jumat' },
  { code: 'Sab', label: 'Sabtu' },
  { code: 'Min', label: 'Minggu' },
];

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

interface OwnerDashboardViewProps {
  ownerInitialized: boolean;
  onPublicDataChanged: () => Promise<void>;
  onOwnerAuthChange?: (authenticated: boolean) => void;
}

type OwnerTab =
  | 'overview'
  | 'orders'
  | 'topups'
  | 'users'
  | 'broadcasts'
  | 'chat'
  | 'history'
  | 'services'
  | 'operation'
  | 'rentals'
  | 'security'
  | 'settings';

const OWNER_TOKEN_KEY = 'nokos_owner_token';

interface HandoverCredentialCard {
  tenantName: string;
  username: string;
  password: string;
  durationDays: number;
  expiresAt: string;
}

export function OwnerDashboardView({
  ownerInitialized,
  onPublicDataChanged,
  onOwnerAuthChange,
}: OwnerDashboardViewProps) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(OWNER_TOKEN_KEY)
  );
  const [initialized, setInitialized] = useState(ownerInitialized);
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dashboardRole, setDashboardRole] = useState<DashboardRole>('owner');
  const [rentalInfo, setRentalInfo] = useState<PublicRentalAccount | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);

  // Auth form state
  const [loginMode, setLoginMode] = useState<'owner' | 'tenant'>('owner');
  const [ownerEmailInput, setOwnerEmailInput] = useState('');
  const [tenantUsernameInput, setTenantUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [setupWhatsapp, setSetupWhatsapp] = useState('');
  const [setupTelegram, setSetupTelegram] = useState('');
  const [setupMerchant, setSetupMerchant] = useState('nokosrfablndo Official');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [loginLockSeconds, setLoginLockSeconds] = useState(0);

  // Owner workspace data
  const [activeTab, setActiveTab] = useState<OwnerTab>('overview');
  const [ownerAccountEmail, setOwnerAccountEmail] = useState('');
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditLog[]>([]);
  const [activeOwnerSessions, setActiveOwnerSessions] = useState<PublicOwnerSession[]>([]);
  const [securityAlertBanner, setSecurityAlertBanner] = useState<string | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityFeedback, setSecurityFeedback] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [services, setServices] = useState<NokosService[]>([]);
  const [orders, setOrders] = useState<NokosOrder[]>([]);
  const [topups, setTopups] = useState<TopUpRequest[]>([]);
  const [users, setUsers] = useState<PublicCustomerUser[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastAnnouncement[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [rentals, setRentals] = useState<PublicRentalAccount[]>([]);
  const [rentalControl, setRentalControl] = useState<RentalControlSettings>({
    webLockMode: false,
    lockMessage:
      'Masa sewa website telah berakhir. Hubungi Owner untuk perpanjangan.',
  });
  const [rentalLockState, setRentalLockState] =
    useState<PublicRentalLockState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);

  // Orders filter & action modal
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>(
    'pending_verification'
  );
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Order action inputs
  const [actionNumber, setActionNumber] = useState('');
  const [actionOtp, setActionOtp] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [providerOrderBusy, setProviderOrderBusy] = useState(false);
  const [providerOrderMsg, setProviderOrderMsg] = useState<string | null>(null);

  // Topup action & reject modal state
  const [topupActionBusyId, setTopupActionBusyId] = useState<string | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [rejectingTopupId, setRejectingTopupId] = useState<string | null>(null);
  const [rejectTopupReason, setRejectTopupReason] = useState('');

  // Customer Users management state
  const [userSearch, setUserSearch] = useState('');
  const [managingUserId, setManagingUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState('');
  const [resetUserPassword, setResetUserPassword] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [userActionBusy, setUserActionBusy] = useState(false);
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);
  const [userActionErr, setUserActionErr] = useState<string | null>(null);

  // Broadcast management state
  const [editingBroadcastId, setEditingBroadcastId] = useState<string | null>(null);
  const [bcTitle, setBcTitle] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcPriority, setBcPriority] = useState<BroadcastPriority>('important');
  const [bcBusy, setBcBusy] = useState(false);
  const [bcError, setBcError] = useState<string | null>(null);
  const [bcFeedback, setBcFeedback] = useState<string | null>(null);

  // Live Chat state
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<'all' | 'open' | 'closed'>('open');
  const [ownerReplyText, setOwnerReplyText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [closingChat, setClosingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // History filter
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'all' | OrderStatus>('all');

  // Service form state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [srvApp, setSrvApp] = useState('');
  const [srvCountry, setSrvCountry] = useState('Indonesia');
  const [srvCode, setSrvCode] = useState('+62');
  const [srvPrice, setSrvPrice] = useState('5000');
  const [srvStock, setSrvStock] = useState('20');
  const [srvTime, setSrvTime] = useState('1-5 Menit');
  const [srvDesc, setSrvDesc] = useState('');
  const [srvProviderProduct, setSrvProviderProduct] = useState('');
  const [srvProviderCountry, setSrvProviderCountry] = useState('');
  const [srvSaving, setSrvSaving] = useState(false);
  const [srvError, setSrvError] = useState<string | null>(null);

  // Settings form state
  const [storeNameInput, setStoreNameInput] = useState('');
  const [ownerWaInput, setOwnerWaInput] = useState('');
  const [ownerTelegramInput, setOwnerTelegramInput] = useState('');
  const [merchantNameInput, setMerchantNameInput] = useState('');
  const [instructionInput, setInstructionInput] = useState('');
  const [waModeInput, setWaModeInput] = useState<WhatsAppMode>('direct');
  const [waTokenInput, setWaTokenInput] = useState('');
  const [waWebhookInput, setWaWebhookInput] = useState('');
  const [notifyNewInput, setNotifyNewInput] = useState(true);
  const [notifyProofInput, setNotifyProofInput] = useState(true);
  const [nokosProviderModeInput, setNokosProviderModeInput] =
    useState<NokosProviderMode>('manual');
  const [nokosApiKeyInput, setNokosApiKeyInput] = useState('');
  const [nokosBaseUrlInput, setNokosBaseUrlInput] = useState('');
  const [providerTesting, setProviderTesting] = useState(false);
  const [providerTestResult, setProviderTestResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);

  // QRIS upload state
  const [qrisUploading, setQrisUploading] = useState(false);
  const [qrisError, setQrisError] = useState<string | null>(null);

  // WA Test state
  const [waTesting, setWaTesting] = useState(false);
  const [waTestResult, setWaTestResult] = useState<WhatsAppNotifLog | null>(null);

  // Password change state
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);

  // Store Operation & Maintenance state
  const [opMode, setOpMode] = useState<StoreOperationMode>('open');
  const [opAutoSchedule, setOpAutoSchedule] = useState(false);
  const [opOpenDays, setOpOpenDays] = useState<WeekdayCode[]>([
    'Sen',
    'Sel',
    'Rab',
    'Kam',
    'Jum',
    'Sab',
    'Min',
  ]);
  const [opOpenTime, setOpOpenTime] = useState('08:00');
  const [opCloseTime, setOpCloseTime] = useState('22:00');
  const [opOpenDesc, setOpOpenDesc] = useState('');
  const [opCloseDesc, setOpCloseDesc] = useState('');
  const [opMaintDesc, setOpMaintDesc] = useState('');
  const [effectiveOp, setEffectiveOp] =
    useState<PublicStoreOperationState | null>(null);
  const [opSaving, setOpSaving] = useState(false);
  const [opFeedback, setOpFeedback] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  // Web Rental management state (Primary Owner only)
  const [rentalTenantName, setRentalTenantName] = useState('');
  const [rentalUsername, setRentalUsername] = useState('');
  const [rentalPassword, setRentalPassword] = useState('');
  const [rentalWhatsapp, setRentalWhatsapp] = useState('');
  const [rentalDays, setRentalDays] = useState('30');
  const [rentalPrice, setRentalPrice] = useState('');
  const [rentalNote, setRentalNote] = useState('');
  const [rentalEnableLock, setRentalEnableLock] = useState(true);
  const [rentalCreating, setRentalCreating] = useState(false);
  const [rentalError, setRentalError] = useState<string | null>(null);
  const [rentalFeedback, setRentalFeedback] = useState<string | null>(null);
  const [handoverCard, setHandoverCard] = useState<HandoverCredentialCard | null>(
    null
  );
  const [handoverCopied, setHandoverCopied] = useState(false);
  const [webLockInput, setWebLockInput] = useState(false);
  const [lockMessageInput, setLockMessageInput] = useState('');
  const [lockSaving, setLockSaving] = useState(false);
  const [lockFeedback, setLockFeedback] = useState<string | null>(null);
  const [rentalRowBusyId, setRentalRowBusyId] = useState<string | null>(null);
  const [customExtendDays, setCustomExtendDays] = useState<Record<string, string>>({});
  const [resettingRental, setResettingRental] =
    useState<PublicRentalAccount | null>(null);
  const [resetRentalPasswordInput, setResetRentalPasswordInput] = useState('');

  const authHeaders = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      base.Authorization = `Bearer ${token}`;
    }
    return base;
  }, [token]);

  const forceRentalLogout = useCallback(
    (reason?: string) => {
      sessionStorage.removeItem(OWNER_TOKEN_KEY);
      setToken(null);
      setAuthenticated(false);
      setDashboardRole('owner');
      setRentalInfo(null);
      setRentals([]);
      setOwnerAccountEmail('');
      setSecurityLogs([]);
      setActiveOwnerSessions([]);
      setSecurityAlertBanner(null);
      setSessionExpiredMsg(
        reason ||
          'Masa sewa akun dashboard Anda telah habis. Sesi keluar otomatis.'
      );
      onOwnerAuthChange?.(false);
    },
    [onOwnerAuthChange]
  );

  const syncSettingsToForm = useCallback((s: OwnerSettings) => {
    setStoreNameInput(s.storeName);
    setOwnerWaInput(s.ownerWhatsapp);
    setOwnerTelegramInput(s.ownerTelegram || '');
    setMerchantNameInput(s.qrisMerchantName);
    setInstructionInput(s.paymentInstruction);
    setWaModeInput(s.whatsappMode);
    setWaTokenInput(s.whatsappApiToken);
    setWaWebhookInput(s.whatsappWebhookUrl);
    setNotifyNewInput(s.notifyOnNewOrder);
    setNotifyProofInput(s.notifyOnPaymentProof);
    setNokosProviderModeInput(s.nokosProviderMode || 'manual');
    setNokosApiKeyInput(s.nokosApiKey || '');
    setNokosBaseUrlInput(s.nokosBaseUrl || '');
  }, []);

  const loadOwnerBootstrap = useCallback(
    async (activeToken: string) => {
      const res = await fetch('/api/owner/bootstrap', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.status === 401) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: string;
          rentalExpired?: boolean;
        };
        sessionStorage.removeItem(OWNER_TOKEN_KEY);
        setToken(null);
        setAuthenticated(false);
        setDashboardRole('owner');
        setRentalInfo(null);
        setOwnerAccountEmail('');
        setSecurityLogs([]);
        setActiveOwnerSessions([]);
        if (errData.rentalExpired || errData.error) {
          setSessionExpiredMsg(errData.error || 'Sesi Anda telah berakhir.');
        }
        onOwnerAuthChange?.(false);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as OwnerBootstrapResponse;
      const role: DashboardRole = data.role || 'owner';
      setDashboardRole(role);
      setRentalInfo(data.rentalInfo || null);
      setSettings(data.settings);
      setServices(data.services);
      setOrders(data.orders);
      setTopups(data.topups || []);
      setUsers(data.users || []);
      setWalletTransactions(data.walletTransactions || []);
      setBroadcasts(data.broadcasts || []);
      setChatThreads(data.chatThreads || []);
      if (data.storeOperation) {
        setOpMode(data.storeOperation.mode);
        setOpAutoSchedule(data.storeOperation.autoBySchedule);
        setOpOpenDays(data.storeOperation.openDays);
        setOpOpenTime(data.storeOperation.openTime);
        setOpCloseTime(data.storeOperation.closeTime);
        setOpOpenDesc(data.storeOperation.openDescription);
        setOpCloseDesc(data.storeOperation.closeDescription);
        setOpMaintDesc(data.storeOperation.maintenanceDescription);
      }
      if (data.effectiveOperation) {
        setEffectiveOp(data.effectiveOperation);
      }
      if (role === 'owner') {
        setOwnerAccountEmail(data.ownerEmail || '');
        setSecurityLogs(data.securityLogs || []);
        setActiveOwnerSessions(data.activeOwnerSessions || []);
        setRentals(data.rentals || []);
        if (data.rentalControl) {
          setRentalControl(data.rentalControl);
          setWebLockInput(data.rentalControl.webLockMode);
          setLockMessageInput(data.rentalControl.lockMessage);
        }
      } else {
        setOwnerAccountEmail('');
        setSecurityLogs([]);
        setActiveOwnerSessions([]);
        setSecurityAlertBanner(null);
        setRentals([]);
        setActiveTab((prev) =>
          prev === 'rentals' || prev === 'security' ? 'overview' : prev
        );
      }
      syncSettingsToForm(data.settings);
      setSessionExpiredMsg(null);
      setAuthenticated(true);
      onOwnerAuthChange?.(true);
    },
    [syncSettingsToForm, onOwnerAuthChange]
  );

  // Check initial owner auth status
  useEffect(() => {
    let active = true;
    const verify = async () => {
      setCheckingAuth(true);
      try {
        const res = await fetch('/api/owner/auth/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await res.json()) as {
          initialized: boolean;
          authenticated: boolean;
          role?: DashboardRole;
          rentalInfo?: PublicRentalAccount | null;
        };
        if (!active) return;
        setInitialized(data.initialized);
        if (data.authenticated && token) {
          await loadOwnerBootstrap(token);
        } else {
          if (token) {
            sessionStorage.removeItem(OWNER_TOKEN_KEY);
            setToken(null);
          }
          setAuthenticated(false);
          setDashboardRole('owner');
          setRentalInfo(null);
        }
      } catch {
        // Ignore network transient error
      } finally {
        if (active) setCheckingAuth(false);
      }
    };
    void verify();
    return () => {
      active = false;
    };
  }, [token, loadOwnerBootstrap]);

  // Real-time WebSocket connection for Owner Dashboard
  useEffect(() => {
    if (!authenticated || !token) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(
        `${proto}//${window.location.host}/ws?role=owner&token=${encodeURIComponent(token)}`
      );

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data as string) as {
            event: string;
            payload: unknown;
          };

          if (parsed.event === 'order:update') {
            const updated = parsed.payload as NokosOrder;
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === updated.id);
              return exists
                ? prev.map((o) => (o.id === updated.id ? updated : o))
                : [updated, ...prev];
            });
            if (
              updated.status === 'pending_verification' ||
              updated.status === 'awaiting_payment' ||
              updated.status === 'processing'
            ) {
              setLiveAlert(
                `Pesanan ${updated.id} (${updated.appName} · ${formatRupiah(updated.totalAmount)}) — ${getStatusLabel(updated.status)}`
              );
              if (soundEnabled) playNotificationChime();
            }
          } else if (parsed.event === 'topup:update') {
            const topup = parsed.payload as TopUpRequest;
            setTopups((prev) => {
              const exists = prev.some((t) => t.id === topup.id);
              return exists
                ? prev.map((t) => (t.id === topup.id ? topup : t))
                : [topup, ...prev];
            });
            if (topup.status === 'pending_verification') {
              setLiveAlert(
                `Isi Saldo ${topup.id} (${formatRupiah(topup.amount)}) dari ${topup.userName} menunggu verifikasi.`
              );
              if (soundEnabled) playNotificationChime();
            }
          } else if (parsed.event === 'user:registered' || parsed.event === 'user:updated') {
            const u = parsed.payload as PublicCustomerUser;
            setUsers((prev) => {
              const exists = prev.some((x) => x.id === u.id);
              return exists ? prev.map((x) => (x.id === u.id ? u : x)) : [u, ...prev];
            });
          } else if (parsed.event === 'chat:thread_created') {
            const thread = parsed.payload as ChatThread;
            setChatThreads((prev) => {
              if (prev.some((t) => t.id === thread.id)) return prev;
              return [thread, ...prev];
            });
            setLiveAlert(`Chat baru dari ${thread.userName}: ${thread.subject}`);
            if (soundEnabled) playNotificationChime();
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
            if (msg.senderRole === 'customer') {
              if (soundEnabled) playNotificationChime();
            }
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
            setBroadcasts(list);
          } else if (parsed.event === 'rental:sync') {
            setRentals(parsed.payload as PublicRentalAccount[]);
          } else if (parsed.event === 'rental:web_state') {
            setRentalLockState(parsed.payload as PublicRentalLockState);
            void onPublicDataChanged();
          } else if (parsed.event === 'rental:expired') {
            const payload = parsed.payload as { reason?: string } | undefined;
            stopped = true;
            forceRentalLogout(payload?.reason);
            void onPublicDataChanged();
          } else if (parsed.event === 'security:log') {
            const entry = parsed.payload as SecurityAuditLog;
            setSecurityLogs((prev) => {
              if (prev.some((x) => x.id === entry.id)) return prev;
              return [entry, ...prev].slice(0, 150);
            });
          } else if (parsed.event === 'security:alert') {
            const alert = parsed.payload as {
              level?: string;
              message?: string;
              ip?: string;
            };
            if (alert?.message) {
              setSecurityAlertBanner(
                `${alert.message}${alert.ip ? ` (IP: ${alert.ip})` : ''}`
              );
              if (soundEnabled) playNotificationChime();
            }
          } else if (parsed.event === 'store:operation_updated') {
            const op = parsed.payload as PublicStoreOperationState;
            setEffectiveOp(op);
          } else if (parsed.event === 'wallet:update') {
            const data = parsed.payload as {
              balance?: number;
              transaction?: WalletTransaction;
            };
            if (data.transaction) {
              const tx = data.transaction;
              setWalletTransactions((prev) =>
                prev.some((x) => x.id === tx.id) ? prev : [tx, ...prev]
              );
            }
          }
        } catch {
          // Ignore malformed WS packet
        }
      };

      ws.onclose = (ev) => {
        if (ev.code === 4002) {
          stopped = true;
          forceRentalLogout(ev.reason || 'Masa sewa akun dashboard Anda telah berakhir.');
          void onPublicDataChanged();
          return;
        }
        if (ev.code === 4003) {
          stopped = true;
          forceRentalLogout(
            ev.reason || 'Sesi Owner dicabut oleh Owner Utama demi keamanan.'
          );
          return;
        }
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [authenticated, token, soundEnabled, forceRentalLogout, onPublicDataChanged]);

  // Brute-force lockout countdown timer
  useEffect(() => {
    if (loginLockSeconds <= 0) return;
    const timer = setInterval(() => {
      setLoginLockSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [loginLockSeconds]);

  // Exact-expiry countdown & automatic client logout for tenant rental accounts
  useEffect(() => {
    if (!authenticated || dashboardRole !== 'tenant' || !rentalInfo) return;
    const expiresMs = Date.parse(rentalInfo.expiresAt);
    if (!Number.isFinite(expiresMs)) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= expiresMs) {
        clearInterval(timer);
        forceRentalLogout(
          'Masa sewa akun Anda telah habis. Dashboard dan akses web dikunci otomatis.'
        );
        void onPublicDataChanged();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [authenticated, dashboardRole, rentalInfo, forceRentalLogout, onPublicDataChanged]);

  const selectedChatThread = useMemo(
    () => chatThreads.find((t) => t.id === selectedChatId) || null,
    [chatThreads, selectedChatId]
  );

  // Automatically mark customer messages as read when Owner selects/views a chat thread
  useEffect(() => {
    if (activeTab !== 'chat' || !selectedChatThread || !token) return;
    const hasUnread = selectedChatThread.messages.some(
      (m) => m.senderRole === 'customer' && !m.readByOwner
    );
    if (!hasUnread) return;
    void fetch(
      `/api/owner/chat/threads/${encodeURIComponent(selectedChatThread.id)}/read`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  }, [activeTab, selectedChatThread, token]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, selectedChatThread?.messages.length]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const openOrderModal = (order: NokosOrder) => {
    setSelectedOrderId(order.id);
    setActionNumber(order.assignedNumber || '');
    setActionOtp(order.otpCode || '');
    setActionNote(order.adminNote || '');
    setActionError(null);
    setProviderOrderMsg(null);
  };

  const handleSetupOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (passwordInput.length < 6) {
      setAuthError('Kata sandi minimal 6 karakter.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/owner/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: passwordInput,
          ownerWhatsapp: setupWhatsapp.trim(),
          ownerTelegram: setupTelegram.trim(),
          qrisMerchantName: setupMerchant.trim(),
        }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Gagal membuat akun owner.');
      }
      sessionStorage.setItem(OWNER_TOKEN_KEY, data.token);
      setToken(data.token);
      setInitialized(true);
      setPasswordInput('');
      setConfirmPasswordInput('');
      await loadOwnerBootstrap(data.token);
      await onPublicDataChanged();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal membuat akun.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoginOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLockSeconds > 0) return;
    setAuthError(null);
    setSessionExpiredMsg(null);
    if (loginMode === 'tenant' && !tenantUsernameInput.trim()) {
      setAuthError('Masukkan username akun sewa.');
      return;
    }
    if (loginMode === 'owner' && !ownerEmailInput.trim()) {
      setAuthError('Masukkan Gmail Owner.');
      return;
    }
    setAuthSubmitting(true);
    try {
      const payload =
        loginMode === 'tenant'
          ? { username: tenantUsernameInput.trim(), password: passwordInput }
          : { email: ownerEmailInput.trim(), password: passwordInput };
      const res = await fetch('/api/owner/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        token?: string;
        error?: string;
        role?: DashboardRole;
        lockedRemainingSeconds?: number;
      };
      if (!res.ok || !data.token) {
        if (
          typeof data.lockedRemainingSeconds === 'number' &&
          data.lockedRemainingSeconds > 0
        ) {
          setLoginLockSeconds(data.lockedRemainingSeconds);
        }
        throw new Error(data.error || 'Login gagal.');
      }
      sessionStorage.setItem(OWNER_TOKEN_KEY, data.token);
      setToken(data.token);
      setOwnerEmailInput('');
      setPasswordInput('');
      setTenantUsernameInput('');
      setLoginLockSeconds(0);
      await loadOwnerBootstrap(data.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      await fetch('/api/owner/auth/logout', {
        method: 'POST',
        headers: authHeaders,
      }).catch(() => {});
    }
    sessionStorage.removeItem(OWNER_TOKEN_KEY);
    setToken(null);
    setAuthenticated(false);
    setDashboardRole('owner');
    setRentalInfo(null);
    setOwnerAccountEmail('');
    setSecurityLogs([]);
    setActiveOwnerSessions([]);
    setSecurityAlertBanner(null);
    setSessionExpiredMsg(null);
    onOwnerAuthChange?.(false);
  };

  const handleOrderAction = async (
    action: 'verify' | 'update_delivery' | 'complete' | 'reject'
  ) => {
    if (!selectedOrder) return;
    setActionSaving(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/owner/orders/${encodeURIComponent(selectedOrder.id)}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({
            action,
            assignedNumber: actionNumber.trim(),
            otpCode: actionOtp.trim(),
            adminNote: actionNote.trim(),
          }),
        }
      );
      const data = (await res.json()) as { order?: NokosOrder; error?: string };
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Gagal memperbarui pesanan.');
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === data.order!.id ? data.order! : o))
      );
      if (data.order.assignedNumber) setActionNumber(data.order.assignedNumber);
      if (data.order.otpCode) setActionOtp(data.order.otpCode);
      if (action === 'verify' || action === 'complete') {
        await onPublicDataChanged();
      }
      if (action === 'complete' || action === 'reject') {
        setSelectedOrderId(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memperbarui.');
    } finally {
      setActionSaving(false);
    }
  };

  const handleOrderProviderAction = async (
    action: 'provision' | 'check_otp' | 'cancel_provider'
  ) => {
    if (!selectedOrder) return;
    setProviderOrderBusy(true);
    setProviderOrderMsg(null);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/owner/orders/${encodeURIComponent(selectedOrder.id)}/provider-action`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ action }),
        }
      );
      const data = (await res.json()) as {
        order?: NokosOrder;
        message?: string;
        error?: string;
      };
      if (data.order) {
        setOrders((prev) =>
          prev.map((o) => (o.id === data.order!.id ? data.order! : o))
        );
        if (data.order.assignedNumber) setActionNumber(data.order.assignedNumber);
        if (data.order.otpCode) setActionOtp(data.order.otpCode);
      }
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menjalankan aksi provider.');
      }
      setProviderOrderMsg(data.message || 'Status provider diperbarui.');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menghubungi provider.'
      );
    } finally {
      setProviderOrderBusy(false);
    }
  };

  const handleTopupAction = async (
    topupId: string,
    action: 'approve' | 'reject',
    rejectReason?: string
  ) => {
    const adminNote = (rejectReason || '').trim();
    if (action === 'reject' && !adminNote) {
      setRejectingTopupId(topupId);
      setRejectTopupReason('');
      return;
    }
    setTopupActionBusyId(topupId);
    setTopupError(null);
    try {
      const res = await fetch(`/api/owner/topups/${encodeURIComponent(topupId)}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ action, adminNote }),
      });
      const data = (await res.json()) as {
        topup?: TopUpRequest;
        user?: PublicCustomerUser;
        error?: string;
      };
      if (!res.ok || !data.topup) {
        throw new Error(data.error || 'Gagal memproses isi saldo.');
      }
      setTopups((prev) =>
        prev.map((t) => (t.id === data.topup!.id ? data.topup! : t))
      );
      if (data.user) {
        setUsers((prev) =>
          prev.map((u) => (u.id === data.user!.id ? data.user! : u))
        );
      }
      setRejectingTopupId(null);
      setRejectTopupReason('');
    } catch (err) {
      setTopupError(err instanceof Error ? err.message : 'Gagal memproses.');
    } finally {
      setTopupActionBusyId(null);
    }
  };

  const openManageUser = (u: PublicCustomerUser) => {
    setManagingUserId(u.id);
    setResetUserName(u.name);
    setResetUserPassword('');
    setAdjustDelta('');
    setAdjustNote('');
    setUserActionMsg(null);
    setUserActionErr(null);
  };

  const handleOwnerResetUserCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingUserId) return;
    setUserActionBusy(true);
    setUserActionMsg(null);
    setUserActionErr(null);
    try {
      const res = await fetch(
        `/api/owner/users/${encodeURIComponent(managingUserId)}/reset-password`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            name: resetUserName.trim(),
            newPassword: resetUserPassword,
          }),
        }
      );
      const data = (await res.json()) as {
        user?: PublicCustomerUser;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Gagal memperbarui akun pelanggan.');
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === data.user!.id ? data.user! : u))
      );
      setResetUserPassword('');
      setUserActionMsg(data.message || 'Data akun pengguna diperbarui.');
    } catch (err) {
      setUserActionErr(
        err instanceof Error ? err.message : 'Gagal memperbarui akun pelanggan.'
      );
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleOwnerAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingUserId) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      setUserActionErr('Masukkan nominal penyesuaian saldo (contoh: 10000 atau -5000).');
      return;
    }
    setUserActionBusy(true);
    setUserActionMsg(null);
    setUserActionErr(null);
    try {
      const res = await fetch(
        `/api/owner/users/${encodeURIComponent(managingUserId)}/adjust-balance`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            amount: delta,
            note: adjustNote.trim(),
          }),
        }
      );
      const data = (await res.json()) as {
        user?: PublicCustomerUser;
        transaction?: WalletTransaction;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Gagal menyesuaikan saldo.');
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === data.user!.id ? data.user! : u))
      );
      if (data.transaction) {
        setWalletTransactions((prev) => [
          data.transaction!,
          ...prev.filter((t) => t.id !== data.transaction!.id),
        ]);
      }
      setAdjustDelta('');
      setAdjustNote('');
      setUserActionMsg(
        `Saldo ${data.user.name} diperbarui menjadi ${formatRupiah(data.user.balance)}.`
      );
    } catch (err) {
      setUserActionErr(
        err instanceof Error ? err.message : 'Gagal menyesuaikan saldo.'
      );
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleSaveBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBcBusy(true);
    setBcError(null);
    setBcFeedback(null);
    try {
      const url = editingBroadcastId
        ? `/api/owner/broadcasts/${encodeURIComponent(editingBroadcastId)}`
        : '/api/owner/broadcasts';
      const method = editingBroadcastId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({
          title: bcTitle.trim(),
          message: bcMessage.trim(),
          priority: bcPriority,
          active: true,
        }),
      });
      const data = (await res.json()) as {
        broadcasts?: BroadcastAnnouncement[];
        error?: string;
      };
      if (!res.ok || !data.broadcasts) {
        throw new Error(data.error || 'Gagal menyimpan broadcast.');
      }
      setBroadcasts(data.broadcasts);
      setEditingBroadcastId(null);
      setBcTitle('');
      setBcMessage('');
      setBcPriority('important');
      setBcFeedback('Broadcast pengumuman berhasil dipublikasikan ke seluruh halaman pelanggan.');
      await onPublicDataChanged();
    } catch (err) {
      setBcError(err instanceof Error ? err.message : 'Gagal menyimpan broadcast.');
    } finally {
      setBcBusy(false);
    }
  };

  const handleToggleBroadcast = async (bc: BroadcastAnnouncement) => {
    const res = await fetch(
      `/api/owner/broadcasts/${encodeURIComponent(bc.id)}`,
      {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ active: !bc.active }),
      }
    );
    const data = (await res.json()) as { broadcasts?: BroadcastAnnouncement[] };
    if (res.ok && data.broadcasts) {
      setBroadcasts(data.broadcasts);
      await onPublicDataChanged();
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    const res = await fetch(`/api/owner/broadcasts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const data = (await res.json()) as { broadcasts?: BroadcastAnnouncement[] };
    if (res.ok && data.broadcasts) {
      setBroadcasts(data.broadcasts);
      await onPublicDataChanged();
    }
  };

  const handleSendOwnerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChatThread || !ownerReplyText.trim()) return;
    setSendingChat(true);
    setChatError(null);
    try {
      const res = await fetch(
        `/api/owner/chat/threads/${encodeURIComponent(selectedChatThread.id)}/messages`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ text: ownerReplyText.trim() }),
        }
      );
      const data = (await res.json()) as { thread?: ChatThread; error?: string };
      if (!res.ok || !data.thread) {
        throw new Error(data.error || 'Gagal mengirim balasan.');
      }
      setChatThreads((prev) =>
        prev.map((t) => (t.id === data.thread!.id ? data.thread! : t))
      );
      setOwnerReplyText('');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Gagal mengirim balasan.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleCloseChat = async (threadId: string) => {
    setClosingChat(true);
    setChatError(null);
    try {
      const res = await fetch(
        `/api/owner/chat/threads/${encodeURIComponent(threadId)}/close`,
        {
          method: 'POST',
          headers: authHeaders,
        }
      );
      const data = (await res.json()) as { thread?: ChatThread; error?: string };
      if (!res.ok || !data.thread) {
        throw new Error(data.error || 'Gagal menutup obrolan.');
      }
      setChatThreads((prev) =>
        prev.map((t) => (t.id === data.thread!.id ? data.thread! : t))
      );
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Gagal menutup obrolan.');
    } finally {
      setClosingChat(false);
    }
  };

  const handleUploadQris = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrisError(null);
    setQrisUploading(true);
    try {
      const encoded = await fileToBase64(file);
      const res = await fetch('/api/owner/qris', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          dataBase64: encoded.dataBase64,
          mimeType: encoded.mimeType,
          qrisMerchantName: merchantNameInput.trim(),
          paymentInstruction: instructionInput.trim(),
        }),
      });
      const data = (await res.json()) as { settings?: OwnerSettings; error?: string };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || 'Gagal mengunggah QRIS.');
      }
      setSettings(data.settings);
      syncSettingsToForm(data.settings);
      setSettingsFeedback('Foto QRIS resmi owner berhasil disimpan.');
      await onPublicDataChanged();
    } catch (err) {
      setQrisError(err instanceof Error ? err.message : 'Gagal mengunggah QRIS.');
    } finally {
      setQrisUploading(false);
    }
  };

  const handleDeleteQris = async () => {
    setQrisUploading(true);
    try {
      const res = await fetch('/api/owner/qris', {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { settings?: OwnerSettings };
      if (res.ok && data.settings) {
        setSettings(data.settings);
        await onPublicDataChanged();
      }
    } finally {
      setQrisUploading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsFeedback(null);
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          storeName: storeNameInput,
          ownerWhatsapp: ownerWaInput,
          ownerTelegram: ownerTelegramInput,
          qrisMerchantName: merchantNameInput,
          paymentInstruction: instructionInput,
          whatsappMode: waModeInput,
          whatsappApiToken: waTokenInput,
          whatsappWebhookUrl: waWebhookInput,
          notifyOnNewOrder: notifyNewInput,
          notifyOnPaymentProof: notifyProofInput,
          nokosProviderMode: nokosProviderModeInput,
          nokosApiKey: nokosApiKeyInput,
          nokosBaseUrl: nokosBaseUrlInput,
        }),
      });
      const data = (await res.json()) as { settings?: OwnerSettings; error?: string };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan.');
      }
      setSettings(data.settings);
      syncSettingsToForm(data.settings);
      setSettingsFeedback('Pengaturan toko, WhatsApp & provider Nokos berhasil disimpan.');
      await onPublicDataChanged();
    } catch (err) {
      setSettingsFeedback(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.'
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleTestProvider = async () => {
    setProviderTesting(true);
    setProviderTestResult(null);
    try {
      const res = await fetch('/api/owner/provider/test', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          nokosProviderMode: nokosProviderModeInput,
          nokosApiKey: nokosApiKeyInput,
          nokosBaseUrl: nokosBaseUrlInput,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; detail?: string };
      setProviderTestResult({
        ok: Boolean(data.ok),
        detail: data.detail || 'Tidak ada respon dari provider.',
      });
    } catch (err) {
      setProviderTestResult({
        ok: false,
        detail: err instanceof Error ? err.message : 'Gagal tes koneksi provider.',
      });
    } finally {
      setProviderTesting(false);
    }
  };

  const handleTestWhatsapp = async () => {
    setWaTesting(true);
    setWaTestResult(null);
    try {
      const res = await fetch('/api/owner/whatsapp/test', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = (await res.json()) as { log?: WhatsAppNotifLog };
      if (data.log) setWaTestResult(data.log);
    } finally {
      setWaTesting(false);
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSrvSaving(true);
    setSrvError(null);
    try {
      const payload = {
        appName: srvApp,
        country: srvCountry,
        countryCode: srvCode,
        price: Number(srvPrice),
        stock: Number(srvStock),
        estimatedTime: srvTime,
        description: srvDesc,
        providerProductCode: srvProviderProduct,
        providerCountryCode: srvProviderCountry,
      };
      const url = editingServiceId
        ? `/api/owner/services/${encodeURIComponent(editingServiceId)}`
        : '/api/owner/services';
      const method = editingServiceId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        services?: NokosService[];
        error?: string;
      };
      if (!res.ok || !data.services) {
        throw new Error(data.error || 'Gagal menyimpan layanan.');
      }
      setServices(data.services);
      setEditingServiceId(null);
      setSrvApp('');
      setSrvDesc('');
      setSrvProviderProduct('');
      setSrvProviderCountry('');
      await onPublicDataChanged();
    } catch (err) {
      setSrvError(err instanceof Error ? err.message : 'Gagal menyimpan layanan.');
    } finally {
      setSrvSaving(false);
    }
  };

  const handleToggleServiceActive = async (srv: NokosService) => {
    const res = await fetch(`/api/owner/services/${encodeURIComponent(srv.id)}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ active: !srv.active }),
    });
    const data = (await res.json()) as { services?: NokosService[] };
    if (res.ok && data.services) {
      setServices(data.services);
      await onPublicDataChanged();
    }
  };

  const handleDeleteService = async (id: string) => {
    const res = await fetch(`/api/owner/services/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const data = (await res.json()) as { services?: NokosService[] };
    if (res.ok && data.services) {
      setServices(data.services);
      await onPublicDataChanged();
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    const res = await fetch('/api/owner/auth/change-password', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: currPass, newPassword: newPass }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      activeOwnerSessions?: PublicOwnerSession[];
    };
    if (!res.ok) {
      setPassMsg(data.error || 'Gagal mengubah kata sandi.');
      return;
    }
    if (data.activeOwnerSessions) {
      setActiveOwnerSessions(data.activeOwnerSessions);
    }
    setCurrPass('');
    setNewPass('');
    setPassMsg('Kata sandi owner berhasil diperbarui dan sesi perangkat lain dikeluarkan.');
  };

  // Primary Owner Only: Security Center Handlers
  const handleRevokeOtherOwnerSessions = async () => {
    setSecurityBusy(true);
    setSecurityFeedback(null);
    setSecurityError(null);
    try {
      const res = await fetch('/api/owner/security/revoke-sessions', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ includeCurrent: false }),
      });
      const data = (await res.json()) as {
        revokedCount?: number;
        activeOwnerSessions?: PublicOwnerSession[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mencabut sesi lain.');
      }
      if (data.activeOwnerSessions) {
        setActiveOwnerSessions(data.activeOwnerSessions);
      }
      setSecurityFeedback(
        `${data.revokedCount ?? 0} sesi perangkat lain berhasil dikeluarkan paksa.`
      );
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Gagal mencabut sesi.');
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleRevokeSingleSession = async (sessionId: string) => {
    setSecurityBusy(true);
    setSecurityFeedback(null);
    setSecurityError(null);
    try {
      const res = await fetch(
        `/api/owner/security/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE',
          headers: authHeaders,
        }
      );
      const data = (await res.json()) as {
        activeOwnerSessions?: PublicOwnerSession[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mencabut sesi.');
      }
      if (data.activeOwnerSessions) {
        setActiveOwnerSessions(data.activeOwnerSessions);
      }
      setSecurityFeedback(`Sesi ${sessionId} berhasil dicabut.`);
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Gagal mencabut sesi.');
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleClearIpLocks = async () => {
    setSecurityBusy(true);
    setSecurityFeedback(null);
    setSecurityError(null);
    try {
      const res = await fetch('/api/owner/security/clear-locks', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mereset blokir IP.');
      }
      setSecurityFeedback('Semua kunci sementara (rate-limit IP) berhasil direset.');
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Gagal mereset blokir IP.');
    } finally {
      setSecurityBusy(false);
    }
  };

  // Store Operational Status (Open / Close / Maintenance) Handlers
  const toggleOpenDay = (day: WeekdayCode) => {
    setOpOpenDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSaveOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (opOpenDays.length === 0) {
      setOpError('Pilih minimal 1 hari operasional.');
      return;
    }
    setOpSaving(true);
    setOpFeedback(null);
    setOpError(null);
    try {
      const res = await fetch('/api/owner/operation', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mode: opMode,
          autoBySchedule: opAutoSchedule,
          openDays: opOpenDays,
          openTime: opOpenTime,
          closeTime: opCloseTime,
          openDescription: opOpenDesc.trim(),
          closeDescription: opCloseDesc.trim(),
          maintenanceDescription: opMaintDesc.trim(),
        }),
      });
      const data = (await res.json()) as {
        storeOperation?: StoreOperationSettings;
        effectiveOperation?: PublicStoreOperationState;
        error?: string;
      };
      if (!res.ok || !data.storeOperation) {
        throw new Error(data.error || 'Gagal menyimpan status operasional.');
      }
      setOpMode(data.storeOperation.mode);
      setOpAutoSchedule(data.storeOperation.autoBySchedule);
      setOpOpenDays(data.storeOperation.openDays);
      setOpOpenTime(data.storeOperation.openTime);
      setOpCloseTime(data.storeOperation.closeTime);
      setOpOpenDesc(data.storeOperation.openDescription);
      setOpCloseDesc(data.storeOperation.closeDescription);
      setOpMaintDesc(data.storeOperation.maintenanceDescription);
      if (data.effectiveOperation) {
        setEffectiveOp(data.effectiveOperation);
      }
      setOpFeedback(
        'Status operasional, jadwal hari/jam WIB, dan keterangan berhasil diperbarui real-time.'
      );
      await onPublicDataChanged();
    } catch (err) {
      setOpError(
        err instanceof Error ? err.message : 'Gagal menyimpan status operasional.'
      );
    } finally {
      setOpSaving(false);
    }
  };

  // Primary Owner Only: Web Rental Handlers
  const handleSaveRentalControl = async (e: React.FormEvent) => {
    e.preventDefault();
    setLockSaving(true);
    setLockFeedback(null);
    setRentalError(null);
    try {
      const res = await fetch('/api/owner/rentals/control', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          webLockMode: webLockInput,
          lockMessage: lockMessageInput.trim(),
        }),
      });
      const data = (await res.json()) as {
        rentalControl?: RentalControlSettings;
        rentalLock?: PublicRentalLockState;
        error?: string;
      };
      if (!res.ok || !data.rentalControl) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan kunci web.');
      }
      setRentalControl(data.rentalControl);
      setWebLockInput(data.rentalControl.webLockMode);
      setLockMessageInput(data.rentalControl.lockMessage);
      if (data.rentalLock) setRentalLockState(data.rentalLock);
      setLockFeedback('Pengaturan kunci website otomatis berhasil disimpan.');
      await onPublicDataChanged();
    } catch (err) {
      setRentalError(
        err instanceof Error ? err.message : 'Gagal menyimpan kontrol sewa.'
      );
    } finally {
      setLockSaving(false);
    }
  };

  const handleCreateRental = async (e: React.FormEvent) => {
    e.preventDefault();
    setRentalCreating(true);
    setRentalError(null);
    setRentalFeedback(null);
    try {
      const res = await fetch('/api/owner/rentals', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tenantName: rentalTenantName.trim(),
          username: rentalUsername.trim(),
          password: rentalPassword.trim(),
          tenantWhatsapp: rentalWhatsapp.trim(),
          durationDays: Number(rentalDays),
          priceAmount: rentalPrice ? Number(rentalPrice) : 0,
          note: rentalNote.trim(),
          enableWebLock: rentalEnableLock,
        }),
      });
      const data = (await res.json()) as {
        rental?: PublicRentalAccount;
        plainPassword?: string;
        rentals?: PublicRentalAccount[];
        rentalControl?: RentalControlSettings;
        rentalLock?: PublicRentalLockState;
        error?: string;
      };
      if (!res.ok || !data.rental || !data.rentals) {
        throw new Error(data.error || 'Gagal membuat akun sewa.');
      }
      setRentals(data.rentals);
      if (data.rentalControl) {
        setRentalControl(data.rentalControl);
        setWebLockInput(data.rentalControl.webLockMode);
      }
      if (data.rentalLock) setRentalLockState(data.rentalLock);
      setHandoverCard({
        tenantName: data.rental.tenantName,
        username: data.rental.username,
        password: data.plainPassword || rentalPassword.trim(),
        durationDays: data.rental.durationDays,
        expiresAt: data.rental.expiresAt,
      });
      setHandoverCopied(false);
      setRentalTenantName('');
      setRentalUsername('');
      setRentalPassword('');
      setRentalWhatsapp('');
      setRentalPrice('');
      setRentalNote('');
      setRentalFeedback(
        `Akun sewa ${data.rental.username} aktif selama ${data.rental.durationDays} hari.`
      );
      await onPublicDataChanged();
    } catch (err) {
      setRentalError(err instanceof Error ? err.message : 'Gagal membuat akun sewa.');
    } finally {
      setRentalCreating(false);
    }
  };

  const handlePatchRental = async (
    id: string,
    payload: {
      addDays?: number;
      status?: 'active' | 'suspended';
      newPassword?: string;
    },
    plainPasswordForCard?: string
  ) => {
    setRentalRowBusyId(id);
    setRentalError(null);
    setRentalFeedback(null);
    try {
      const res = await fetch(`/api/owner/rentals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        rental?: PublicRentalAccount;
        rentals?: PublicRentalAccount[];
        rentalLock?: PublicRentalLockState;
        error?: string;
      };
      if (!res.ok || !data.rental || !data.rentals) {
        throw new Error(data.error || 'Gagal memperbarui akun sewa.');
      }
      setRentals(data.rentals);
      if (data.rentalLock) setRentalLockState(data.rentalLock);
      if (plainPasswordForCard) {
        setHandoverCard({
          tenantName: data.rental.tenantName,
          username: data.rental.username,
          password: plainPasswordForCard,
          durationDays: data.rental.durationDays,
          expiresAt: data.rental.expiresAt,
        });
        setHandoverCopied(false);
      }
      setResettingRental(null);
      setResetRentalPasswordInput('');
      setRentalFeedback(`Akun sewa ${data.rental.username} berhasil diperbarui.`);
      await onPublicDataChanged();
    } catch (err) {
      setRentalError(err instanceof Error ? err.message : 'Gagal memperbarui sewa.');
    } finally {
      setRentalRowBusyId(null);
    }
  };

  const handleDeleteRental = async (id: string) => {
    setRentalRowBusyId(id);
    setRentalError(null);
    try {
      const res = await fetch(`/api/owner/rentals/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as {
        rentals?: PublicRentalAccount[];
        rentalLock?: PublicRentalLockState;
        error?: string;
      };
      if (!res.ok || !data.rentals) {
        throw new Error(data.error || 'Gagal menghapus akun sewa.');
      }
      setRentals(data.rentals);
      if (data.rentalLock) setRentalLockState(data.rentalLock);
      await onPublicDataChanged();
    } catch (err) {
      setRentalError(err instanceof Error ? err.message : 'Gagal menghapus akun sewa.');
    } finally {
      setRentalRowBusyId(null);
    }
  };

  const copyHandoverCredential = async () => {
    if (!handoverCard) return;
    const dashboardUrl = `${window.location.origin}/#owner`;
    const text = [
      `AKSES SEWA WEBSITE ${(settings?.storeName || 'nokosrfablndo').toUpperCase()}`,
      `Penyewa: ${handoverCard.tenantName}`,
      `Link Dashboard: ${dashboardUrl}`,
      `Mode Login: Akun Sewa`,
      `Username: ${handoverCard.username}`,
      `Kata Sandi: ${handoverCard.password}`,
      `Masa Aktif: ${handoverCard.durationDays} Hari`,
      `Berakhir Pada: ${formatDateTime(handoverCard.expiresAt)}`,
      ``,
      `Akun akan keluar otomatis saat masa sewa berakhir.`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setHandoverCopied(true);
      setTimeout(() => setHandoverCopied(false), 2500);
    } catch {
      setRentalError('Gagal menyalin ke clipboard.');
    }
  };

  const exportCsv = () => {
    const headers = [
      'ID Pesanan',
      'Waktu Dibuat',
      'Pelanggan',
      'WA Pelanggan',
      'Layanan',
      'Negara',
      'Qty',
      'Metode Bayar',
      'Total',
      'Pengirim QRIS',
      'Nomor Nokos',
      'OTP',
      'Status',
    ];
    const rows = orders.map((o) => [
      o.id,
      o.createdAt,
      o.customerName,
      o.customerWhatsapp,
      o.appName,
      `${o.country} (${o.countryCode})`,
      String(o.quantity),
      o.paymentMethod === 'balance' ? 'Saldo Akun' : 'QRIS Owner',
      String(o.totalAmount),
      o.paymentSenderName || '-',
      o.assignedNumber || '-',
      o.otpCode || '-',
      getStatusLabel(o.status),
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riwayat-nokos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportUsersCsv = () => {
    const headers = [
      'ID Akun',
      'Nama / Username',
      'Gmail',
      'Nomor Aktif',
      'Saldo',
      'Tanggal Daftar',
    ];
    const rows = users.map((u) => [
      u.id,
      u.name,
      u.email,
      u.whatsapp,
      String(u.balance),
      u.createdAt,
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-pengguna-permanen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = useMemo(() => {
    let pendingVerify = 0;
    let processingCount = 0;
    let completedCount = 0;
    let revenue = 0;
    for (const o of orders) {
      if (o.status === 'pending_verification') pendingVerify++;
      if (o.status === 'processing') {
        processingCount++;
        revenue += o.totalAmount;
      }
      if (o.status === 'completed') {
        completedCount++;
        revenue += o.totalAmount;
      }
    }
    const pendingTopups = topups.filter(
      (t) => t.status === 'pending_verification'
    ).length;
    const unreadChats = chatThreads.reduce(
      (acc, t) =>
        acc +
        t.messages.filter((m) => m.senderRole === 'customer' && !m.readByOwner).length,
      0
    );
    const openChats = chatThreads.filter((t) => t.status === 'open').length;
    const ratedThreads = chatThreads.filter((t) => t.rating !== null);
    const avgRating =
      ratedThreads.length > 0
        ? (
            ratedThreads.reduce((s, t) => s + (t.rating || 0), 0) /
            ratedThreads.length
          ).toFixed(1)
        : null;

    return {
      pendingVerify,
      processingCount,
      completedCount,
      revenue,
      pendingTopups,
      unreadChats,
      openChats,
      avgRating,
      ratedCount: ratedThreads.length,
    };
  }, [orders, topups, chatThreads]);

  const filteredQueueOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerWhatsapp.toLowerCase().includes(q) ||
        o.appName.toLowerCase().includes(q)
      );
    });
  }, [orders, orderStatusFilter, orderSearch]);

  const filteredHistoryOrders = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (historyStatus !== 'all' && o.status !== historyStatus) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerWhatsapp.toLowerCase().includes(q) ||
        (o.assignedNumber || '').toLowerCase().includes(q) ||
        (o.paymentSenderName || '').toLowerCase().includes(q)
      );
    });
  }, [orders, historyStatus, historySearch]);

  const filteredChatThreads = useMemo(() => {
    return chatThreads.filter((t) => {
      if (chatFilter === 'all') return true;
      return t.status === chatFilter;
    });
  }, [chatThreads, chatFilter]);

  const userOrderStats = useMemo(() => {
    const stats = new Map<string, { count: number; spent: number }>();
    for (const o of orders) {
      if (!o.userId) continue;
      const cur = stats.get(o.userId) || { count: 0, spent: 0 };
      cur.count += 1;
      if (o.status === 'processing' || o.status === 'completed') {
        cur.spent += o.totalAmount;
      }
      stats.set(o.userId, cur);
    }
    return stats;
  }, [orders]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.whatsapp.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch]);

  const managingUser = useMemo(
    () => users.find((u) => u.id === managingUserId) || null,
    [users, managingUserId]
  );

  const totalCustomerBalance = useMemo(
    () => users.reduce((s, u) => s + u.balance, 0),
    [users]
  );

  if (checkingAuth) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-sm text-slate-500">
        Memeriksa sesi owner...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto py-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900 mb-3">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {initialized
                ? loginMode === 'tenant'
                  ? 'Masuk Akun Sewa Web'
                  : 'Masuk Dashboard Owner'
                : 'Aktifkan Dashboard Owner'}
            </h1>
            <p className="text-sm text-slate-600">
              {initialized
                ? loginMode === 'tenant'
                  ? 'Masuk menggunakan username dan kata sandi akun sewa dari Owner.'
                  : 'Verifikasi Gmail Owner & kata sandi untuk masuk ke panel kontrol Owner Utama.'
                : 'Buat kata sandi Owner pertama kali untuk mengamankan dashboard dan pengaturan toko.'}
            </p>
          </div>

          {sessionExpiredMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 font-medium leading-relaxed">
              {sessionExpiredMsg}
            </div>
          )}

          {!initialized ? (
            <form onSubmit={handleSetupOwner} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kata Sandi Owner (min. 6 karakter)
                </label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Buat kata sandi aman"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ulangi Kata Sandi
                </label>
                <input
                  type="password"
                  required
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Ketik ulang kata sandi"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor WhatsApp Admin (untuk notifikasi)
                </label>
                <input
                  type="tel"
                  value={setupWhatsapp}
                  onChange={(e) => setSetupWhatsapp(e.target.value)}
                  placeholder="081234567890"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Username Telegram Resmi Owner (Opsional)
                </label>
                <input
                  type="text"
                  value={setupTelegram}
                  onChange={(e) => setSetupTelegram(e.target.value)}
                  placeholder="@username_telegram"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Merchant QRIS
                </label>
                <input
                  type="text"
                  value={setupMerchant}
                  onChange={(e) => setSetupMerchant(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              {authError && <p className="text-xs text-rose-600">{authError}</p>}
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {authSubmitting ? 'Menyimpan...' : 'Buat Akun Owner & Masuk'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('owner');
                    setAuthError(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    loginMode === 'owner'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Owner Utama
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('tenant');
                    setAuthError(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    loginMode === 'tenant'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Akun Sewa
                </button>
              </div>

              <form onSubmit={handleLoginOwner} className="space-y-4">
                {loginMode === 'owner' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Gmail Owner
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={ownerEmailInput}
                      onChange={(e) => setOwnerEmailInput(e.target.value)}
                      placeholder="Masukkan Gmail resmi Owner"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Username Akun Sewa
                    </label>
                    <input
                      type="text"
                      required
                      value={tenantUsernameInput}
                      onChange={(e) => setTenantUsernameInput(e.target.value)}
                      placeholder="Masukkan username dari Owner"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {loginMode === 'tenant' ? 'Kata Sandi Sewa' : 'Kata Sandi Owner'}
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={
                      loginMode === 'tenant'
                        ? 'Masukkan kata sandi akun sewa'
                        : 'Masukkan kata sandi owner'
                    }
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                {loginLockSeconds > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 font-medium flex items-center justify-between gap-2">
                    <span>Akses dikunci sementara demi keamanan.</span>
                    <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                      {loginLockSeconds} dtk
                    </span>
                  </div>
                )}
                {authError && <p className="text-xs text-rose-600">{authError}</p>}
                <button
                  type="submit"
                  disabled={authSubmitting || loginLockSeconds > 0}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {loginLockSeconds > 0
                    ? `Terkunci (${loginLockSeconds} detik)`
                    : authSubmitting
                      ? 'Memeriksa...'
                      : loginMode === 'tenant'
                        ? 'Masuk Akun Sewa'
                        : 'Masuk Dashboard'}
                </button>
                {loginMode === 'owner' && (
                  <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5 pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                    <span>
                      Proteksi aktif: verifikasi Gmail + sandi, penguncian brute-force otomatis, dan pencatatan IP untuk setiap percobaan intrusi.
                    </span>
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Owner / Tenant Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">
              {dashboardRole === 'tenant'
                ? `Dashboard Sewa · ${rentalInfo?.tenantName || 'Penyewa'}`
                : 'Dashboard Owner'}
            </h1>
            {dashboardRole === 'owner' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Owner Utama</span>
              </span>
            )}
          </div>
          {dashboardRole === 'tenant' && rentalInfo ? (
            <p className="text-xs text-slate-600 font-mono tabular-nums flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                <Clock className="w-3.5 h-3.5" />
                Sisa aktif: {formatRemainingLease(rentalInfo.expiresAt, nowTick)}
              </span>
              <span className="text-slate-300">·</span>
              <span>Berakhir {formatDateTime(rentalInfo.expiresAt)}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Verifikasi QRIS, kelola isi saldo pelanggan, balas live chat, sewa web, dan pengaturan WhatsApp.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Suara Notif Aktif</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                <span>Suara Notif Mati</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {settings && !settings.qrisImageUrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 text-sm text-amber-900">
            <p className="font-semibold">Foto QRIS Owner Belum Diunggah</p>
            <p className="text-xs text-amber-800">
              Pelanggan belum dapat membayar atau mengisi saldo via QRIS sebelum Anda mengunggah foto QRIS asli Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="px-3.5 py-2 bg-amber-900 text-white text-xs font-semibold rounded-lg hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Unggah Foto QRIS Sekarang
          </button>
        </div>
      )}

      {dashboardRole === 'owner' && securityAlertBanner && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-rose-900">
            <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
            <span className="font-semibold">{securityAlertBanner}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('security');
                setSecurityAlertBanner(null);
              }}
              className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              Periksa Log
            </button>
            <button
              type="button"
              onClick={() => setSecurityAlertBanner(null)}
              className="text-rose-700 hover:text-rose-900 p-1"
              aria-label="Tutup peringatan keamanan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {liveAlert && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-emerald-900">
            <Bell className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-medium">{liveAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setLiveAlert(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Owner Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'overview'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Ringkasan & Grafik</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'orders'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Pesanan ({kpis.pendingVerify})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('topups')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'topups'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Isi Saldo ({kpis.pendingTopups})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'users'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Data Pengguna ({users.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('broadcasts')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'broadcasts'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>Broadcast ({broadcasts.filter((b) => b.active).length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'chat'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Live Chat ({kpis.unreadChats > 0 ? `${kpis.unreadChats} baru` : kpis.openChats})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'history'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Riwayat ({orders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'services'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Layanan ({services.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('operation')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'operation'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Operasional</span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
              (effectiveOp?.effectiveMode || opMode) === 'maintenance'
                ? 'bg-rose-100 text-rose-800'
                : (effectiveOp?.effectiveMode || opMode) === 'close'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {(effectiveOp?.effectiveMode || opMode) === 'maintenance'
              ? 'MAINT'
              : (effectiveOp?.effectiveMode || opMode) === 'close'
                ? 'CLOSE'
                : 'OPEN'}
          </span>
        </button>
        {dashboardRole === 'owner' && (
          <button
            type="button"
            onClick={() => setActiveTab('rentals')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'rentals'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Sewa Web ({rentals.filter((r) => r.status === 'active').length})</span>
          </button>
        )}
        {dashboardRole === 'owner' && (
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'security'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>
              Keamanan ({activeOwnerSessions.length})
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'settings'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          QRIS, Kontak & API
        </button>
      </div>

      {/* TAB 0: OVERVIEW & PREMIUM ANALYTICS CHARTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {(kpis.pendingVerify > 0 || kpis.pendingTopups > 0 || kpis.unreadChats > 0) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">
                  Antrean Menunggu Tindakan Owner
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {kpis.pendingVerify} pesanan perlu verifikasi · {kpis.pendingTopups} permintaan isi saldo · {kpis.unreadChats} pesan live chat baru
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {kpis.pendingVerify > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Proses Pesanan ({kpis.pendingVerify})
                  </button>
                )}
                {kpis.pendingTopups > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('topups')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Verifikasi Saldo ({kpis.pendingTopups})
                  </button>
                )}
                {kpis.unreadChats > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Buka Chat ({kpis.unreadChats})
                  </button>
                )}
              </div>
            </div>
          )}

          <OwnerAnalyticsCharts
            orders={orders}
            users={users}
            topups={topups}
            chatThreads={chatThreads}
          />
        </div>
      )}

      {/* TAB 1: ORDERS & MANUAL VERIFICATION */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Perlu Verifikasi</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                {kpis.pendingVerify}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Sedang Diproses</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {kpis.processingCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Transaksi Selesai</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {kpis.completedCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Pendapatan Terverifikasi</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatRupiah(kpis.revenue)}
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                [
                  { v: 'pending_verification', l: 'Perlu Verifikasi' },
                  { v: 'processing', l: 'Diproses' },
                  { v: 'awaiting_payment', l: 'Belum Bayar' },
                  { v: 'completed', l: 'Selesai' },
                  { v: 'rejected', l: 'Ditolak' },
                  { v: 'all', l: 'Semua' },
                ] as { v: 'all' | OrderStatus; l: string }[]
              ).map((tab) => (
                <button
                  key={tab.v}
                  type="button"
                  onClick={() => setOrderStatusFilter(tab.v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    orderStatusFilter === tab.v
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.l}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Cari ID pesanan, nama, WA..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {filteredQueueOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                Tidak ada pesanan pada filter ini
              </p>
              <p className="text-xs text-slate-500">
                Pesanan baru dan bukti pembayaran yang dikirim pelanggan akan muncul di sini secara otomatis.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Pesanan</th>
                      <th className="py-3 px-4">Pelanggan</th>
                      <th className="py-3 px-4">Bukti / Metode</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4">Status & Nomor</th>
                      <th className="py-3 px-4 text-right">Aksi Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredQueueOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 align-top">
                          <p className="font-mono font-semibold text-slate-900">
                            {order.id}
                          </p>
                          <p className="text-xs text-slate-700 mt-0.5">
                            {order.appName} · {order.country} ({order.countryCode}) x
                            {order.quantity}
                          </p>
                          <p className="text-xs font-mono text-slate-400 tabular-nums mt-0.5">
                            {formatDateTime(order.createdAt)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          <p className="font-medium text-slate-900">
                            {order.customerName}
                          </p>
                          <a
                            href={buildWaUrl(
                              order.customerWhatsapp,
                              `Halo ${order.customerName}, mengenai pesanan ${order.id} (${order.appName}):`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-mono text-emerald-700 hover:underline mt-0.5"
                          >
                            {order.customerWhatsapp}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          {order.paymentMethod === 'balance' ? (
                            <span className="text-xs font-medium text-emerald-700">
                              Lunas via Saldo Akun
                            </span>
                          ) : order.paymentProofUrl ? (
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => setZoomImageUrl(order.paymentProofUrl)}
                                className="border border-slate-200 rounded-md overflow-hidden bg-slate-50 hover:border-emerald-600 transition-colors shrink-0"
                              >
                                <img
                                  src={order.paymentProofUrl}
                                  alt={`Bukti ${order.id}`}
                                  referrerPolicy="no-referrer"
                                  className="w-11 h-11 object-cover"
                                />
                              </button>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-800 truncate max-w-[140px]">
                                  {order.paymentSenderName || 'Pengirim'}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setZoomImageUrl(order.paymentProofUrl)}
                                  className="text-xs text-emerald-700 hover:underline"
                                >
                                  Lihat struk
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              QRIS (Belum diunggah)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatRupiah(order.totalAmount)}
                        </td>
                        <td className="py-3.5 px-4 align-top space-y-1">
                          <StatusLabel status={order.status} />
                          {order.assignedNumber && (
                            <p className="text-xs font-mono text-slate-800 tabular-nums">
                              {order.assignedNumber}
                              {order.otpCode ? ` · OTP ${order.otpCode}` : ''}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right">
                          <button
                            type="button"
                            onClick={() => openOrderModal(order)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                          >
                            {order.status === 'pending_verification'
                              ? 'Verifikasi'
                              : 'Kelola'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TOP UP SALDO QRIS VERIFICATION */}
      {activeTab === 'topups' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Verifikasi Isi Saldo Pengguna (QRIS Owner)
              </h2>
              <p className="text-xs text-slate-500">
                Begitu Anda klik Verifikasi & Masuk Saldo, saldo akun pengguna otomatis bertambah secara real-time.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-600">
              Total Pengguna Terdaftar: <strong className="font-mono">{users.length}</strong>
            </span>
          </div>

          {topupError && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {topupError}
            </p>
          )}

          {topups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Belum ada permintaan isi saldo dari pengguna.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">ID & Waktu</th>
                      <th className="py-3 px-4">Pengguna</th>
                      <th className="py-3 px-4">Bukti QRIS</th>
                      <th className="py-3 px-4 text-right">Nominal</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {topups.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4">
                          <p className="font-mono font-semibold text-slate-900">
                            {t.id}
                          </p>
                          <p className="text-xs font-mono text-slate-400 tabular-nums">
                            {formatDateTime(t.createdAt)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-900">{t.userName}</p>
                          <p className="text-xs font-mono text-slate-500">
                            WA {t.userWhatsapp}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => setZoomImageUrl(t.proofUrl)}
                              className="border border-slate-200 rounded-md overflow-hidden bg-slate-50"
                            >
                              <img
                                src={t.proofUrl}
                                alt={`Bukti ${t.id}`}
                                referrerPolicy="no-referrer"
                                className="w-11 h-11 object-cover"
                              />
                            </button>
                            <div>
                              <p className="text-xs font-medium text-slate-800">
                                {t.senderName}
                              </p>
                              <button
                                type="button"
                                onClick={() => setZoomImageUrl(t.proofUrl)}
                                className="text-xs text-emerald-700 hover:underline"
                              >
                                Lihat struk
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatRupiah(t.amount)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium">
                          {t.status === 'approved' ? (
                            <span className="text-emerald-700">Masuk ke Saldo</span>
                          ) : t.status === 'rejected' ? (
                            <span className="text-rose-600">Ditolak</span>
                          ) : (
                            <span className="text-blue-700">Menunggu Verifikasi</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {t.status === 'pending_verification' ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={topupActionBusyId === t.id}
                                onClick={() => void handleTopupAction(t.id, 'approve')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                Verifikasi & Masuk Saldo
                              </button>
                              <button
                                type="button"
                                disabled={topupActionBusyId === t.id}
                                onClick={() => void handleTopupAction(t.id, 'reject')}
                                className="px-2.5 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg transition-colors"
                              >
                                Tolak
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {formatDateTime(t.reviewedAt)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2B: PERMANENT CUSTOMER DATABASE */}
      {activeTab === 'users' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Akun Permanen</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {users.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Saldo Tersimpan</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {formatRupiah(totalCustomerBalance)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Pengguna Pernah Transaksi</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {users.filter((u) => (userOrderStats.get(u.id)?.count || 0) > 0).length}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Cari ID akun, nama/username, Gmail, atau nomor aktif..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <button
              type="button"
              onClick={exportUsersCsv}
              disabled={users.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Pengguna</span>
            </button>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-1.5">
              <p className="text-sm font-semibold text-slate-900">
                Belum ada akun pengguna ditemukan
              </p>
              <p className="text-xs text-slate-500">
                Semua akun pelanggan yang mendaftar akan tersimpan permanen di sini.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">ID & Terdaftar</th>
                      <th className="py-3 px-4">Username & Gmail</th>
                      <th className="py-3 px-4">Nomor Aktif</th>
                      <th className="py-3 px-4 text-right">Order & Belanja</th>
                      <th className="py-3 px-4 text-right">Saldo Akun</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredUsers.map((u) => {
                      const stat = userOrderStats.get(u.id) || { count: 0, spent: 0 };
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4 align-top">
                            <p className="font-mono font-semibold text-slate-900">
                              {u.id}
                            </p>
                            <p className="text-xs font-mono text-slate-400 tabular-nums mt-0.5">
                              {formatDateTime(u.createdAt)}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <p className="font-semibold text-slate-900">{u.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                          </td>
                          <td className="py-3.5 px-4 align-top font-mono text-xs text-slate-700 tabular-nums">
                            {u.whatsapp}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right tabular-nums">
                            <p className="text-xs font-semibold text-slate-900">
                              {stat.count} pesanan
                            </p>
                            <p className="text-xs font-mono text-slate-500">
                              {formatRupiah(stat.spent)}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                            {formatRupiah(u.balance)}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right">
                            <button
                              type="button"
                              onClick={() => openManageUser(u)}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              Kelola Akun
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2C: BROADCAST / PENGUMUMAN PENTING */}
      {activeTab === 'broadcasts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveBroadcast}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-slate-900">
                  {editingBroadcastId
                    ? 'Edit Pengumuman Broadcast'
                    : 'Buat Pengumuman / Broadcast'}
                </h2>
                <p className="text-xs text-slate-500">
                  Tampil langsung secara real-time di halaman atas seluruh pelanggan.
                </p>
              </div>
              {editingBroadcastId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBroadcastId(null);
                    setBcTitle('');
                    setBcMessage('');
                    setBcPriority('important');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Batal
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tingkat Prioritas
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'info', label: 'Info' },
                      { id: 'important', label: 'Penting' },
                      { id: 'urgent', label: 'Darurat' },
                    ] as { id: BroadcastPriority; label: string }[]
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setBcPriority(p.id)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                        bcPriority === p.id
                          ? p.id === 'urgent'
                            ? 'border-rose-600 bg-rose-50 text-rose-800'
                            : p.id === 'important'
                              ? 'border-amber-600 bg-amber-50 text-amber-900'
                              : 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Pengumuman
                </label>
                <input
                  type="text"
                  required
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="Contoh: Update Stok WhatsApp Indonesia & Jadwal Maintenance"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Isi Pengumuman
                </label>
                <textarea
                  rows={4}
                  required
                  value={bcMessage}
                  onChange={(e) => setBcMessage(e.target.value)}
                  placeholder="Tulis informasi penting untuk semua pengguna..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {bcError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                {bcError}
              </p>
            )}
            {bcFeedback && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {bcFeedback}
              </p>
            )}

            <button
              type="submit"
              disabled={bcBusy}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2"
            >
              <Megaphone className="w-4 h-4" />
              <span>
                {bcBusy
                  ? 'Mengirim Broadcast...'
                  : editingBroadcastId
                    ? 'Simpan Perubahan Broadcast'
                    : 'Publikasikan Broadcast'}
              </span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Riwayat Pengumuman ({broadcasts.length})
              </h3>
              <span className="text-xs text-slate-500">
                Hanya pengumuman Aktif yang tampil ke pelanggan
              </span>
            </div>

            {broadcasts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-1.5">
                <p className="text-sm font-semibold text-slate-900">
                  Belum ada pengumuman broadcast
                </p>
                <p className="text-xs text-slate-500">
                  Gunakan formulir di sebelah kiri untuk mengumumkan info stok, promo, atau pemberitahuan penting.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {broadcasts.map((bc) => (
                  <div
                    key={bc.id}
                    className={`bg-white border rounded-xl p-4 space-y-2.5 ${
                      bc.active ? 'border-slate-200' : 'border-slate-200 opacity-65'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span
                            className={`font-bold uppercase tracking-wide ${
                              bc.priority === 'urgent'
                                ? 'text-rose-700'
                                : bc.priority === 'important'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {bc.priority === 'urgent'
                              ? 'Darurat'
                              : bc.priority === 'important'
                                ? 'Penting'
                                : 'Info'}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-slate-400 tabular-nums">
                            {formatDateTime(bc.updatedAt)}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span
                            className={`font-semibold ${
                              bc.active ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {bc.active ? 'Aktif' : 'Disembunyikan'}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-900">{bc.title}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleBroadcast(bc)}
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors"
                        >
                          {bc.active ? 'Sembunyikan' : 'Tampilkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBroadcastId(bc.id);
                            setBcTitle(bc.title);
                            setBcMessage(bc.message);
                            setBcPriority(bc.priority);
                            setBcFeedback(null);
                          }}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                          aria-label="Edit pengumuman"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteBroadcast(bc.id)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded"
                          aria-label="Hapus pengumuman"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {bc.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LIVE CHAT PELANGGAN */}
      {activeTab === 'chat' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
              {(
                [
                  { v: 'open', l: `Terbuka (${kpis.openChats})` },
                  { v: 'closed', l: 'Ditutup' },
                  { v: 'all', l: 'Semua' },
                ] as { v: 'open' | 'closed' | 'all'; l: string }[]
              ).map((f) => (
                <button
                  key={f.v}
                  type="button"
                  onClick={() => setChatFilter(f.v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    chatFilter === f.v
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.l}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>
                Rating Pelanggan:{' '}
                <strong className="font-mono text-slate-900">
                  {kpis.avgRating ? `${kpis.avgRating} / 5` : 'Belum ada'}
                </strong>{' '}
                ({kpis.ratedCount} ulasan)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Thread List */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                <p className="text-xs font-semibold text-slate-700">
                  Obrolan Pelanggan ({filteredChatThreads.length})
                </p>
              </div>
              {filteredChatThreads.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Tidak ada obrolan pada filter ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 max-h-[500px] overflow-y-auto">
                  {filteredChatThreads.map((t) => {
                    const unread = t.messages.filter(
                      (m) => m.senderRole === 'customer' && !m.readByOwner
                    ).length;
                    const last = t.messages[t.messages.length - 1];
                    const isSelected = selectedChatId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedChatId(t.id)}
                        className={`w-full text-left p-4 transition-colors ${
                          isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {t.userName}
                          </p>
                          <span
                            className={`text-[11px] font-medium shrink-0 ${
                              t.status === 'open'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {t.status === 'open' ? 'Terbuka' : 'Ditutup'}
                          </span>
                        </div>
                        <p className="text-xs font-mono font-medium text-slate-700 truncate mt-0.5">
                          {t.orderId || t.id}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {last?.text || ''}
                        </p>
                        <div className="flex items-center justify-between mt-1.5 text-[11px]">
                          <span className="font-mono text-slate-400 tabular-nums">
                            {formatDateTime(t.updatedAt)}
                          </span>
                          {unread > 0 ? (
                            <span className="font-semibold text-blue-700">
                              {unread} belum dibaca
                            </span>
                          ) : t.rating !== null ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {t.rating}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Chat Thread */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-[500px]">
              {!selectedChatThread ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-slate-500">
                  Pilih salah satu obrolan pelanggan di sebelah kiri untuk melihat dan membalas pesan.
                </div>
              ) : (
                <>
                  <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 grid grid-cols-3 items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {selectedChatThread.userName}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 truncate">
                        {selectedChatThread.orderId || selectedChatThread.id}
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2">
                        <img
                          src={OWNER_AVATAR_URL}
                          alt="RFABLNDO"
                          className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-500/40 shrink-0"
                        />
                        <p className="text-sm font-extrabold text-slate-900">RFABLNDO</p>
                      </div>
                      <p className="text-[11px] font-mono text-slate-500">
                        {selectedChatThread.userWhatsapp}
                      </p>
                    </div>
                    <div className="flex justify-end">
                    {selectedChatThread.status === 'open' ? (
                      <button
                        type="button"
                        disabled={closingChat}
                        onClick={() => void handleCloseChat(selectedChatThread.id)}
                        className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-rose-300 hover:text-rose-700 text-slate-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        {closingChat ? 'Menutup...' : 'Tutup Obrolan'}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">
                        Obrolan Ditutup
                      </span>
                    )}
                    </div>
                  </div>

                  <div className="flex-1 p-5 space-y-3 overflow-y-auto max-h-[360px] bg-slate-50/40">
                    {selectedChatThread.messages.map((msg) => {
                      const isOwnerMsg = msg.senderRole === 'owner';
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwnerMsg ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-xl px-4 py-2.5 text-sm space-y-1 ${
                              isOwnerMsg
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-900'
                            }`}
                          >
                            {!isOwnerMsg && (
                              <p className="text-[11px] font-semibold text-slate-600">
                                {msg.senderName}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {msg.text}
                            </p>
                            <div
                              className={`flex items-center justify-end gap-1.5 text-[11px] ${
                                isOwnerMsg ? 'text-slate-300' : 'text-slate-400'
                              }`}
                            >
                              <span className="font-mono tabular-nums">
                                {formatDateTime(msg.createdAt)}
                              </span>
                              {isOwnerMsg &&
                                (msg.readByCustomer ? (
                                  <CheckCheck className="w-4 h-4 text-sky-400" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-400" />
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {selectedChatThread.status === 'open' ? (
                    <form
                      onSubmit={handleSendOwnerReply}
                      className="p-4 border-t border-slate-200 bg-white space-y-2"
                    >
                      {chatError && (
                        <p className="text-xs text-rose-600">{chatError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ownerReplyText}
                          onChange={(e) => setOwnerReplyText(e.target.value)}
                          placeholder="Balas pesan pelanggan..."
                          className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                        <button
                          type="submit"
                          disabled={sendingChat || !ownerReplyText.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          <Send className="w-4 h-4" />
                          <span>Balas</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-600 space-y-1.5">
                      <p className="font-semibold text-slate-800">
                        Obrolan ini telah ditutup pada{' '}
                        {formatDateTime(selectedChatThread.closedAt)}.
                      </p>
                      {selectedChatThread.rating !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${
                                  s <= (selectedChatThread.rating || 0)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-300'
                                }`}
                              />
                            ))}
                          </span>
                          <span>
                            {selectedChatThread.review
                              ? `Ulasan: "${selectedChatThread.review}"`
                              : 'Pelanggan memberikan rating.'}
                          </span>
                        </div>
                      ) : (
                        <p className="text-slate-500">
                          Menunggu pelanggan mengirimkan rating & ulasan.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPLETE HISTORY & CSV EXPORT */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:max-w-xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Cari ID, pelanggan, WA, nomor Nokos, pengirim..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <select
                value={historyStatus}
                onChange={(e) =>
                  setHistoryStatus(e.target.value as 'all' | OrderStatus)
                }
                className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="all">Semua Status</option>
                <option value="awaiting_payment">Menunggu Pembayaran</option>
                <option value="pending_verification">Menunggu Verifikasi</option>
                <option value="processing">Diproses Admin</option>
                <option value="completed">Selesai</option>
                <option value="rejected">Ditolak</option>
              </select>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={orders.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">ID & Waktu</th>
                    <th className="py-3 px-4">Pelanggan</th>
                    <th className="py-3 px-4">Layanan</th>
                    <th className="py-3 px-4">Pembayaran</th>
                    <th className="py-3 px-4">Nomor & OTP</th>
                    <th className="py-3 px-4">Notif WA</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredHistoryOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-8 text-center text-slate-500 text-sm"
                      >
                        Belum ada data transaksi.
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryOrders.map((o) => {
                      const lastWa =
                        o.whatsappNotifLog[o.whatsappNotifLog.length - 1];
                      return (
                        <tr
                          key={o.id}
                          onClick={() => openOrderModal(o)}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-3 px-4 align-top">
                            <p className="font-mono font-semibold text-slate-900">
                              {o.id}
                            </p>
                            <p className="text-slate-500 font-mono tabular-nums">
                              {formatDateTime(o.createdAt)}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <p className="font-medium text-slate-900">
                              {o.customerName}
                            </p>
                            <p className="font-mono text-slate-500">
                              {o.customerWhatsapp}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top text-slate-800">
                            {o.appName} ({o.country}) x{o.quantity}
                          </td>
                          <td className="py-3 px-4 align-top text-slate-700">
                            {o.paymentMethod === 'balance'
                              ? 'Saldo Akun'
                              : o.paymentSenderName || 'QRIS'}
                          </td>
                          <td className="py-3 px-4 align-top font-mono text-slate-800">
                            {o.assignedNumber || '-'}
                            {o.otpCode ? ` (${o.otpCode})` : ''}
                          </td>
                          <td className="py-3 px-4 align-top text-slate-600 max-w-[180px] truncate">
                            {lastWa ? lastWa.detail : '-'}
                          </td>
                          <td className="py-3 px-4 align-top text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatRupiah(o.totalAmount)}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <StatusLabel status={o.status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MANAGE NOKOS SERVICES */}
      {activeTab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveService}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {editingServiceId ? 'Edit Layanan Nokos' : 'Tambah Layanan Nokos'}
              </h2>
              {editingServiceId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingServiceId(null);
                    setSrvApp('');
                    setSrvDesc('');
                    setSrvProviderProduct('');
                    setSrvProviderCountry('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Batal
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Aplikasi
                </label>
                <input
                  type="text"
                  required
                  value={srvApp}
                  onChange={(e) => setSrvApp(e.target.value)}
                  placeholder="Contoh: WhatsApp"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                    placeholder="Indonesia"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kode Negara
                  </label>
                  <input
                    type="text"
                    required
                    value={srvCode}
                    onChange={(e) => setSrvCode(e.target.value)}
                    placeholder="+62"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Harga (IDR)
                  </label>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    required
                    value={srvPrice}
                    onChange={(e) => setSrvPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Stok Tersedia
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={srvStock}
                    onChange={(e) => setSrvStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                  placeholder="1-5 Menit"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kode Produk API (Opsional)
                  </label>
                  <input
                    type="text"
                    value={srvProviderProduct}
                    onChange={(e) => setSrvProviderProduct(e.target.value)}
                    placeholder="whatsapp / wa"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kode Negara API (Opsional)
                  </label>
                  <input
                    type="text"
                    value={srvProviderCountry}
                    onChange={(e) => setSrvProviderCountry(e.target.value)}
                    placeholder="indonesia / 6"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Singkat
                </label>
                <textarea
                  rows={2}
                  value={srvDesc}
                  onChange={(e) => setSrvDesc(e.target.value)}
                  placeholder="Keterangan layanan untuk pelanggan..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
            {srvError && <p className="text-xs text-rose-600">{srvError}</p>}
            <button
              type="submit"
              disabled={srvSaving}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>
                {srvSaving
                  ? 'Menyimpan...'
                  : editingServiceId
                    ? 'Simpan Perubahan'
                    : 'Tambah Layanan'}
              </span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Aplikasi & Negara</th>
                    <th className="py-3 px-4 text-right">Harga</th>
                    <th className="py-3 px-4 text-right">Stok</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {services.map((srv) => (
                    <tr key={srv.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">
                          {srv.appName} — {srv.country} ({srv.countryCode})
                        </p>
                        <p className="text-xs text-slate-500">
                          {srv.estimatedTime}
                          {srv.providerProductCode
                            ? ` · API: ${srv.providerProductCode}/${srv.providerCountryCode || '-'}`
                            : ''}
                          {srv.description ? ` · ${srv.description}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        {formatRupiah(srv.price)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {srv.stock}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleServiceActive(srv)}
                          className={`text-xs font-medium hover:underline ${
                            srv.active ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {srv.active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingServiceId(srv.id);
                              setSrvApp(srv.appName);
                              setSrvCountry(srv.country);
                              setSrvCode(srv.countryCode);
                              setSrvPrice(String(srv.price));
                              setSrvStock(String(srv.stock));
                              setSrvTime(srv.estimatedTime);
                              setSrvDesc(srv.description);
                              setSrvProviderProduct(srv.providerProductCode || '');
                              setSrvProviderCountry(srv.providerCountryCode || '');
                            }}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                            aria-label="Edit layanan"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteService(srv.id)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded"
                            aria-label="Hapus layanan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5B: SEWA WEB & AKUN PENYEWA (KHUSUS OWNER UTAMA) */}
      {activeTab === 'rentals' && dashboardRole === 'owner' && (
        <div className="space-y-6">
          {/* Status Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Akun Sewa Aktif</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {rentals.filter((r) => r.status === 'active').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Akun Sewa</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {rentals.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Kunci Web Otomatis</p>
              <p
                className={`text-lg font-bold mt-1 ${
                  rentalControl.webLockMode ? 'text-amber-700' : 'text-slate-700'
                }`}
              >
                {rentalControl.webLockMode
                  ? rentalLockState?.locked
                    ? 'Aktif (Web Terkunci)'
                    : 'Aktif (Berjalan)'
                  : 'Nonaktif (Web Terbuka)'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Lock Control + Create Account */}
            <div className="lg:col-span-5 space-y-6">
              <form
                onSubmit={handleSaveRentalControl}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="space-y-0.5">
                  <h2 className="text-base font-bold text-slate-900">
                    Kontrol Penguncian Web Sewaan
                  </h2>
                  <p className="text-xs text-slate-500">
                    Hanya Owner Utama yang dapat mengatur aturan masa sewa dan kunci otomatis.
                  </p>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <input
                    type="checkbox"
                    checked={webLockInput}
                    onChange={(e) => setWebLockInput(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>
                    <strong className="text-slate-900 block">
                      Kunci website otomatis jika masa sewa habis
                    </strong>
                    Saat aktif dan tidak ada akun sewa yang berjalan, halaman pelanggan terkunci otomatis dan akun penyewa terkeluar.
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pesan Saat Website Terkunci
                  </label>
                  <textarea
                    rows={2}
                    value={lockMessageInput}
                    onChange={(e) => setLockMessageInput(e.target.value)}
                    placeholder="Masa sewa website telah berakhir. Hubungi Owner untuk perpanjangan."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                {lockFeedback && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    {lockFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={lockSaving}
                  className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {lockSaving ? 'Menyimpan...' : 'Simpan Pengaturan Kunci'}
                </button>
              </form>

              <form
                onSubmit={handleCreateRental}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="space-y-0.5">
                  <h2 className="text-base font-bold text-slate-900">
                    Buat Akun Sewa Baru
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tentukan berapa hari masa sewa dan data login yang akan diserahkan ke penyewa.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Penyewa
                    </label>
                    <input
                      type="text"
                      required
                      value={rentalTenantName}
                      onChange={(e) => setRentalTenantName(e.target.value)}
                      placeholder="Nama lengkap atau nama toko penyewa"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Username Login Sewa
                      </label>
                      <input
                        type="text"
                        required
                        value={rentalUsername}
                        onChange={(e) => setRentalUsername(e.target.value)}
                        placeholder="username_penyewa"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Kata Sandi Akun Sewa
                      </label>
                      <input
                        type="text"
                        required
                        value={rentalPassword}
                        onChange={(e) => setRentalPassword(e.target.value)}
                        placeholder="Min. 6 karakter"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Durasi Sewa (Hari)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {[1, 3, 7, 14, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setRentalDays(String(d))}
                          className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border transition-colors ${
                            Number(rentalDays) === d
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {d} Hari
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      required
                      value={rentalDays}
                      onChange={(e) => setRentalDays(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nomor WA Penyewa (Opsional)
                      </label>
                      <input
                        type="tel"
                        value={rentalWhatsapp}
                        onChange={(e) => setRentalWhatsapp(e.target.value)}
                        placeholder="081234567890"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Biaya Sewa (IDR, Opsional)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={rentalPrice}
                        onChange={(e) => setRentalPrice(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Catatan Internal (Opsional)
                    </label>
                    <input
                      type="text"
                      value={rentalNote}
                      onChange={(e) => setRentalNote(e.target.value)}
                      placeholder="Keterangan paket sewa"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rentalEnableLock}
                      onChange={(e) => setRentalEnableLock(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>Aktifkan kunci web otomatis setelah masa sewa berakhir</span>
                  </label>
                </div>

                {rentalError && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {rentalError}
                  </p>
                )}
                {rentalFeedback && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    {rentalFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={rentalCreating}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{rentalCreating ? 'Membuat Akun...' : 'Buat Akun Sewa'}</span>
                </button>
              </form>
            </div>

            {/* Right Column: Handover Credential Card + Rental Accounts List */}
            <div className="lg:col-span-7 space-y-5">
              {handoverCard && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                        Data Akun Sewa Siap Diserahkan
                      </p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        {handoverCard.tenantName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyHandoverCredential()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      {handoverCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Data Akun</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white border border-emerald-200 rounded-lg p-4 text-xs">
                    <div>
                      <p className="text-slate-500">Link Dashboard</p>
                      <p className="font-mono font-semibold text-slate-900 break-all mt-0.5">
                        {`${window.location.origin}/#owner`}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Masa Aktif</p>
                      <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                        {handoverCard.durationDays} Hari (s/d{' '}
                        {formatDateTime(handoverCard.expiresAt)})
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Username (Mode Akun Sewa)</p>
                      <p className="font-mono font-bold text-slate-900 mt-0.5">
                        {handoverCard.username}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Kata Sandi</p>
                      <p className="font-mono font-bold text-slate-900 mt-0.5">
                        {handoverCard.password}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    Daftar Penyewa Website ({rentals.length})
                  </p>
                  <span className="text-xs text-slate-500">
                    Terkeluar otomatis saat masa aktif berakhir
                  </span>
                </div>

                {rentals.length === 0 ? (
                  <div className="p-10 text-center space-y-1.5">
                    <p className="text-sm font-semibold text-slate-900">
                      Belum ada akun sewa dibuat
                    </p>
                    <p className="text-xs text-slate-500">
                      Gunakan formulir di sebelah kiri untuk membuat akun sewa dan mengatur jumlah harinya.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {rentals.map((r) => {
                      const isActive = r.status === 'active';
                      const isSuspended = r.status === 'suspended';
                      const customVal = customExtendDays[r.id] || '';
                      return (
                        <div key={r.id} className="p-4 sm:p-5 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {r.tenantName}
                                </span>
                                <span className="text-xs font-mono text-slate-500">
                                  @{r.username}
                                </span>
                                <span className="text-xs font-mono text-slate-400">
                                  {r.id}
                                </span>
                              </div>
                              <p className="text-xs font-mono text-slate-600 tabular-nums">
                                Paket {r.durationDays} hari
                                {r.priceAmount > 0
                                  ? ` · ${formatRupiah(r.priceAmount)}`
                                  : ''}
                                {r.tenantWhatsapp ? ` · WA ${r.tenantWhatsapp}` : ''}
                              </p>
                              {r.note && (
                                <p className="text-xs text-slate-500">{r.note}</p>
                              )}
                            </div>

                            <div className="text-right space-y-0.5">
                              <span
                                className={`inline-block text-xs font-bold ${
                                  isActive
                                    ? 'text-emerald-700'
                                    : isSuspended
                                      ? 'text-amber-700'
                                      : 'text-rose-600'
                                }`}
                              >
                                {isActive
                                  ? 'Aktif'
                                  : isSuspended
                                    ? 'Ditangguhkan'
                                    : 'Kedaluwarsa'}
                              </span>
                              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                                Berakhir: {formatDateTime(r.expiresAt)}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {[1, 7, 30].map((daysAdd) => (
                                <button
                                  key={daysAdd}
                                  type="button"
                                  disabled={rentalRowBusyId === r.id}
                                  onClick={() =>
                                    void handlePatchRental(r.id, { addDays: daysAdd })
                                  }
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap"
                                >
                                  +{daysAdd} Hari
                                </button>
                              ))}
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={customVal}
                                  onChange={(e) =>
                                    setCustomExtendDays((prev) => ({
                                      ...prev,
                                      [r.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Hari"
                                  className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
                                />
                                <button
                                  type="button"
                                  disabled={
                                    rentalRowBusyId === r.id || !Number(customVal)
                                  }
                                  onClick={() => {
                                    const d = Math.round(Number(customVal));
                                    if (d > 0) {
                                      void handlePatchRental(r.id, { addDays: d });
                                      setCustomExtendDays((prev) => ({
                                        ...prev,
                                        [r.id]: '',
                                      }));
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
                                >
                                  Tambah
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                disabled={rentalRowBusyId === r.id}
                                onClick={() =>
                                  void handlePatchRental(r.id, {
                                    status: isSuspended ? 'active' : 'suspended',
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
                              >
                                {isSuspended ? (
                                  <>
                                    <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Aktifkan</span>
                                  </>
                                ) : (
                                  <>
                                    <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Tangguhkan</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={rentalRowBusyId === r.id}
                                onClick={() => {
                                  setResettingRental(r);
                                  setResetRentalPasswordInput('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span>Reset Sandi</span>
                              </button>
                              <button
                                type="button"
                                disabled={rentalRowBusyId === r.id}
                                onClick={() => void handleDeleteRental(r.id)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md"
                                aria-label="Hapus akun sewa"
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
          </div>
        </div>
      )}

      {/* TAB 5C: PUSAT KEAMANAN & DETEKSI INTRUSI (KHUSUS OWNER UTAMA) */}
      {activeTab === 'security' && dashboardRole === 'owner' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Gmail Owner Terkunci Permanen</p>
              <p className="text-sm font-bold font-mono text-slate-900 mt-1.5 break-all">
                {ownerAccountEmail || '-'}
              </p>
              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                Setup publik dinonaktifkan permanen
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Sesi Owner Utama Aktif</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {activeOwnerSessions.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Terikat sidik jari perangkat & browser
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Peringatan / Percobaan Intrusi</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-rose-700 mt-1">
                {securityLogs.filter((l) => l.level !== 'info').length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Blokir brute-force & pemantauan akses real-time
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Active Owner Sessions + Password Change */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h2 className="text-base font-bold text-slate-900">
                      Sesi Login Owner Aktif
                    </h2>
                    <p className="text-xs text-slate-500">
                      Token dicabut otomatis jika dipakai dari perangkat berbeda.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={securityBusy}
                      onClick={() => void handleClearIpLocks()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Reset Blokir IP</span>
                    </button>
                    <button
                      type="button"
                      disabled={securityBusy || activeOwnerSessions.length <= 1}
                      onClick={() => void handleRevokeOtherOwnerSessions()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluarkan Sesi Lain</span>
                    </button>
                  </div>
                </div>

                {securityError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {securityError}
                  </p>
                )}
                {securityFeedback && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    {securityFeedback}
                  </p>
                )}

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {activeOwnerSessions.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500 text-center">
                      Tidak ada sesi aktif tercatat.
                    </p>
                  ) : (
                    activeOwnerSessions.map((ses) => (
                      <div key={ses.id} className="p-3.5 space-y-1.5 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Monitor className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="text-xs font-mono font-bold text-slate-900 truncate">
                              {ses.ip}
                            </span>
                            {ses.current && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                Perangkat Ini
                              </span>
                            )}
                          </div>
                          {!ses.current && (
                            <button
                              type="button"
                              disabled={securityBusy}
                              onClick={() => void handleRevokeSingleSession(ses.id)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap"
                            >
                              Cabut
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate" title={ses.userAgent}>
                          {ses.userAgent}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                          Masuk: {formatDateTime(ses.createdAt)} · Aktif:{' '}
                          {formatDateTime(ses.lastSeenAt)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <form
                onSubmit={handleChangePassword}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Ubah Kata Sandi Owner Utama
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mengubah sandi otomatis mengeluarkan seluruh sesi perangkat lain.
                  </p>
                </div>
                <input
                  type="password"
                  required
                  value={currPass}
                  onChange={(e) => setCurrPass(e.target.value)}
                  placeholder="Kata sandi saat ini"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Kata sandi baru (min. 6 karakter)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {passMsg && <p className="text-xs text-slate-700">{passMsg}</p>}
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Perbarui Kata Sandi Owner
                </button>
              </form>
            </div>

            {/* Right Column: Live Intrusion & Audit Log */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <p className="text-sm font-bold text-slate-900">
                    Log Audit & Deteksi Intrusi Real-Time ({securityLogs.length})
                  </p>
                </div>
                <span className="text-[11px] text-slate-500">
                  Pembaruan otomatis setiap ada percobaan akses
                </span>
              </div>

              {securityLogs.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Belum ada catatan aktivitas keamanan.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 max-h-[620px] overflow-y-auto">
                  {securityLogs.map((log) => (
                    <div key={log.id} className="p-4 space-y-1.5 hover:bg-slate-50/70">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border ${
                              log.level === 'critical'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : log.level === 'warning'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {log.level === 'critical' && (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            <span>
                              {log.level === 'critical'
                                ? 'Kritis'
                                : log.level === 'warning'
                                  ? 'Peringatan'
                                  : 'Aman'}
                            </span>
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-900">
                            {log.event}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {log.detail}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 truncate">
                        IP: {log.ip} · {log.userAgent}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: STORE OPERATION (OPEN / CLOSE / MAINTENANCE & SCHEDULE) */}
      {activeTab === 'operation' && (
        <div className="space-y-6">
          {/* Live Effective Status Summary */}
          <div
            className={`rounded-xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              (effectiveOp?.effectiveMode || opMode) === 'maintenance'
                ? 'bg-rose-50 border-rose-200'
                : (effectiveOp?.effectiveMode || opMode) === 'close'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                    (effectiveOp?.effectiveMode || opMode) === 'maintenance'
                      ? 'bg-rose-700 text-white'
                      : (effectiveOp?.effectiveMode || opMode) === 'close'
                        ? 'bg-amber-700 text-white'
                        : 'bg-emerald-700 text-white'
                  }`}
                >
                  {(effectiveOp?.effectiveMode || opMode) === 'maintenance'
                    ? 'MODE MAINTENANCE'
                    : (effectiveOp?.effectiveMode || opMode) === 'close'
                      ? 'TOKO CLOSE / TUTUP'
                      : 'TOKO OPEN / BUKA'}
                </span>
                <span className="text-xs font-mono font-semibold text-slate-800">
                  {effectiveOp?.scheduleSummary ||
                    `${opOpenDays.join(', ')} · ${opOpenTime} - ${opCloseTime} WIB`}
                </span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed max-w-2xl">
                {effectiveOp?.activeDescription ||
                  (opMode === 'maintenance'
                    ? opMaintDesc
                    : opMode === 'close'
                      ? opCloseDesc
                      : opOpenDesc)}
              </p>
            </div>
            <div className="text-xs font-mono text-slate-600 shrink-0 md:text-right">
              <p className="font-semibold text-slate-900">Status Real-Time Pelanggan</p>
              <p>
                {opAutoSchedule
                  ? 'Otomatis ikut jadwal WIB'
                  : 'Kontrol manual Owner'}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSaveOperation}
            className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6"
          >
            <div className="space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-700" />
                <span>Kontrol Operasional, Jam & Hari Buka, serta Maintenance</span>
              </h2>
              <p className="text-xs text-slate-500">
                Atur apakah website sedang Open, Close, atau Maintenance beserta hari dan jam operasional WIB serta keterangannya untuk pelanggan.
              </p>
            </div>

            {/* 1. Mode Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Pilih Mode Website Saat Ini
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setOpMode('open')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    opMode === 'open'
                      ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-bold text-emerald-900">OPEN (Buka)</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Pelanggan dapat memesan nomor kosong & mengisi saldo dengan normal.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setOpMode('close')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    opMode === 'close'
                      ? 'border-amber-600 bg-amber-50 ring-1 ring-amber-600'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-bold text-amber-900">CLOSE (Tutup)</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Web tetap terlihat, tetapi tombol order & isi saldo ditutup sementara sesuai keterangan.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setOpMode('maintenance')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    opMode === 'maintenance'
                      ? 'border-rose-600 bg-rose-50 ring-1 ring-rose-600'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-bold text-rose-900">
                    MAINTENANCE (Perbaikan)
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Seluruh halaman publik dialihkan ke layar pemberitahuan Maintenance.
                  </p>
                </button>
              </div>
            </div>

            {/* 2. Days & Hours WIB Schedule */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Jadwal Hari & Jam Operasional (WIB)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ditampilkan langsung kepada pelanggan di toko agar tahu kapan layanan buka/tutup.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setOpOpenDays(['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'])
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                  >
                    Setiap Hari
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpOpenDays(['Sen', 'Sel', 'Rab', 'Kam', 'Jum'])
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                  >
                    Senin - Jumat
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpOpenDays(['Sab', 'Min'])}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                  >
                    Akhir Pekan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                {ALL_WEEKDAYS.map((day) => {
                  const selected = opOpenDays.includes(day.code);
                  return (
                    <button
                      key={day.code}
                      type="button"
                      onClick={() => toggleOpenDay(day.code)}
                      className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                        selected
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Buka (WIB)
                  </label>
                  <input
                    type="time"
                    required
                    value={opOpenTime}
                    onChange={(e) => setOpOpenTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Tutup (WIB)
                  </label>
                  <input
                    type="time"
                    required
                    value={opCloseTime}
                    onChange={(e) => setOpCloseTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={opAutoSchedule}
                  onChange={(e) => setOpAutoSchedule(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>
                  <strong className="text-slate-900">
                    Otomatis Buka/Tutup Mengikuti Hari & Jam WIB di atas
                  </strong>
                  <span className="block text-slate-500 mt-0.5">
                    Jika mode utama OPEN dan opsi ini aktif, toko otomatis berubah ke CLOSE saat di luar hari/jam buka WIB. Mode MAINTENANCE tetap menimpa jadwal otomatis.
                  </span>
                </span>
              </label>
            </div>

            {/* 3. Open / Close / Maintenance Descriptions */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Keterangan / Deskripsi Status untuk Pelanggan
              </h3>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Saat OPEN (Buka)
                </label>
                <textarea
                  rows={2}
                  value={opOpenDesc}
                  onChange={(e) => setOpOpenDesc(e.target.value)}
                  placeholder="Contoh: Layanan order Nokos & pengisian saldo aktif penuh. OTP masuk otomatis & cepat."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Saat CLOSE (Tutup)
                </label>
                <textarea
                  rows={2}
                  value={opCloseDesc}
                  onChange={(e) => setOpCloseDesc(e.target.value)}
                  placeholder="Contoh: Toko sedang tutup sementara di luar jam operasional. Pesanan dibuka kembali besok jam 08:00 WIB."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Saat MAINTENANCE (Perbaikan)
                </label>
                <textarea
                  rows={2}
                  value={opMaintDesc}
                  onChange={(e) => setOpMaintDesc(e.target.value)}
                  placeholder="Contoh: Sistem sedang dalam pemeliharaan/update server agar layanan makin lancar. Mohon tunggu sebentar."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
                />
              </div>
            </div>

            {opError && (
              <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                {opError}
              </p>
            )}
            {opFeedback && (
              <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                {opFeedback}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={opSaving}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {opSaving ? 'Menyimpan...' : 'Simpan & Terapkan Real-Time'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 6: OWNER QRIS & REAL-TIME WHATSAPP SETTINGS */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Foto QRIS Pembayaran Owner
              </h2>
              <p className="text-xs text-slate-500">
                Hanya foto QRIS yang Anda unggah di sini yang akan digunakan untuk order dan isi saldo pelanggan.
              </p>
            </div>

            {settings?.qrisImageUrl ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-3">
                <img
                  src={settings.qrisImageUrl}
                  alt="QRIS Owner"
                  referrerPolicy="no-referrer"
                  className="w-56 h-56 mx-auto object-contain bg-white border border-slate-200 rounded-lg p-2"
                />
                <p className="text-xs font-medium text-slate-700">
                  Merchant: {settings.qrisMerchantName}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Ganti Foto QRIS</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadQris}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleDeleteQris()}
                    disabled={qrisUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-rose-300 text-rose-600 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 py-10 px-4 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-xl cursor-pointer transition-colors text-center">
                <QrCode className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">
                  {qrisUploading ? 'Mengunggah QRIS...' : 'Klik untuk Unggah Foto QRIS Anda'}
                </span>
                <span className="text-xs text-slate-500">
                  Format PNG, JPG, atau WEBP (maks. 5 MB)
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUploadQris}
                  className="sr-only"
                />
              </label>
            )}

            {qrisError && <p className="text-xs text-rose-600">{qrisError}</p>}

            {dashboardRole === 'owner' && (
              <form
                onSubmit={handleChangePassword}
                className="pt-5 border-t border-slate-200 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  Ubah Kata Sandi Owner Utama
                </h3>
                <input
                  type="password"
                  required
                  value={currPass}
                  onChange={(e) => setCurrPass(e.target.value)}
                  placeholder="Kata sandi saat ini"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Kata sandi baru (min. 6 karakter)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {passMsg && <p className="text-xs text-slate-700">{passMsg}</p>}
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-semibold rounded-lg transition-colors"
                >
                  Perbarui Kata Sandi
                </button>
              </form>
            )}
          </div>

          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
          >
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Pengaturan Toko & Notifikasi WhatsApp Real-Time
              </h2>
              <p className="text-xs text-slate-500">
                Konfigurasikan nomor WhatsApp admin dan gateway otomatis agar setiap pesanan baru langsung dikirim ke WhatsApp Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Toko
                </label>
                <input
                  type="text"
                  value={storeNameInput}
                  onChange={(e) => setStoreNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Merchant QRIS
                </label>
                <input
                  type="text"
                  value={merchantNameInput}
                  onChange={(e) => setMerchantNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Instruksi Pembayaran QRIS untuk Pelanggan
              </label>
              <textarea
                rows={2}
                value={instructionInput}
                onChange={(e) => setInstructionInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor WhatsApp Admin Penerima Notifikasi
                  </label>
                  <input
                    type="tel"
                    value={ownerWaInput}
                    onChange={(e) => setOwnerWaInput(e.target.value)}
                    placeholder="6281234567890"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username Telegram Resmi Owner
                  </label>
                  <input
                    type="text"
                    value={ownerTelegramInput}
                    onChange={(e) => setOwnerTelegramInput(e.target.value)}
                    placeholder="@username_telegram"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  {ownerTelegramInput.trim() && (
                    <a
                      href={`https://t.me/${ownerTelegramInput.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline mt-1"
                    >
                      <span>
                        t.me/{ownerTelegramInput.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, '')}
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Metode Pengiriman Notifikasi WhatsApp
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'direct',
                        title: 'Direct WA Link',
                        desc: 'Tanpa API, tombol 1-klik wa.me + notif live dashboard.',
                      },
                      {
                        id: 'fonnte',
                        title: 'Fonnte API',
                        desc: 'Kirim WA otomatis real-time via api.fonnte.com.',
                      },
                      {
                        id: 'webhook',
                        title: 'Custom Webhook',
                        desc: 'POST JSON otomatis ke server WA Gateway Anda.',
                      },
                    ] as { id: WhatsAppMode; title: string; desc: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setWaModeInput(m.id)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        waModeInput === m.id
                          ? 'border-emerald-600 bg-emerald-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900">{m.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {m.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {waModeInput !== 'direct' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  {waModeInput === 'webhook' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        URL Webhook WhatsApp Gateway
                      </label>
                      <input
                        type="url"
                        value={waWebhookInput}
                        onChange={(e) => setWaWebhookInput(e.target.value)}
                        placeholder="https://gateway-anda.com/send-whatsapp"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {waModeInput === 'fonnte'
                        ? 'Token API Fonnte'
                        : 'Bearer Token Webhook (Opsional)'}
                    </label>
                    <input
                      type="password"
                      value={waTokenInput}
                      onChange={(e) => setWaTokenInput(e.target.value)}
                      placeholder="Masukkan token API gateway Anda"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyNewInput}
                    onChange={(e) => setNotifyNewInput(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>
                    Kirim notifikasi WhatsApp otomatis untuk setiap pesanan baru yang masuk
                  </span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyProofInput}
                    onChange={(e) => setNotifyProofInput(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>
                    Kirim notifikasi WhatsApp saat pelanggan mengunggah bukti pembayaran / isi saldo
                  </span>
                </label>
              </div>
            </div>

            {/* Real SMS Provider API Integration Section */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Sumber Nomor Kosong & Penerimaan SMS OTP Asli
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih penyedia nomor virtual nyata agar nomor dan SMS OTP benar-benar masuk dari aplikasi terkait, tanpa simulasi.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'manual',
                      title: 'Manual SIM / Supplier',
                      desc: 'Owner input nomor asli & OTP SMS masuk secara manual.',
                    },
                    {
                      id: 'fivesim',
                      title: '5sim.net API',
                      desc: 'Beli nomor real & terima SMS OTP otomatis via 5sim API.',
                    },
                    {
                      id: 'sms_activate',
                      title: 'SMS-Activate / API Sejenis',
                      desc: 'Protokol handler_api.php (SMS-Activate, SMSHub, GrizzlySMS).',
                    },
                  ] as { id: NokosProviderMode; title: string; desc: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setNokosProviderModeInput(mode.id)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      nokosProviderModeInput === mode.id
                        ? 'border-emerald-600 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{mode.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {mode.desc}
                    </p>
                  </button>
                ))}
              </div>

              {nokosProviderModeInput !== 'manual' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      API Key Provider ({nokosProviderModeInput === 'fivesim' ? 'Bearer API Key 5sim' : 'API Key handler_api'})
                    </label>
                    <input
                      type="password"
                      value={nokosApiKeyInput}
                      onChange={(e) => setNokosApiKeyInput(e.target.value)}
                      placeholder="Tempel API Key asli akun provider Anda"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Base URL API (Opsional — biarkan kosong untuk default)
                    </label>
                    <input
                      type="url"
                      value={nokosBaseUrlInput}
                      onChange={(e) => setNokosBaseUrlInput(e.target.value)}
                      placeholder={
                        nokosProviderModeInput === 'fivesim'
                          ? 'https://5sim.net'
                          : 'https://api.sms-activate.org/stubs/handler_api.php'
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              )}

              {providerTestResult && (
                <div
                  className={`text-xs rounded-lg p-3 border ${
                    providerTestResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <p className="font-semibold">Status Provider Nokos:</p>
                  <p className="mt-0.5">{providerTestResult.detail}</p>
                </div>
              )}
            </div>

            {settingsFeedback && (
              <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {settingsFeedback}
              </p>
            )}

            {waTestResult && (
              <div
                className={`text-xs rounded-lg p-3 border ${
                  waTestResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <p className="font-semibold">
                  Hasil Tes Notifikasi ({waTestResult.mode}):
                </p>
                <p className="mt-0.5">{waTestResult.detail}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleTestWhatsapp()}
                  disabled={waTesting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{waTesting ? 'Mengirim Tes...' : 'Tes Kirim WA'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestProvider()}
                  disabled={providerTesting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${providerTesting ? 'animate-spin' : ''}`} />
                  <span>{providerTesting ? 'Menguji API...' : 'Tes Koneksi API Nokos'}</span>
                </button>
              </div>
              <button
                type="submit"
                disabled={settingsSaving}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {settingsSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Owner Order Verification & Delivery Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  {selectedOrder.id}
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Verifikasi & Proses Pesanan
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-200 text-sm">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">
                    {selectedOrder.appName} — {selectedOrder.country} (
                    {selectedOrder.countryCode}) x{selectedOrder.quantity}
                  </p>
                  <p className="text-slate-600">
                    Pelanggan: {selectedOrder.customerName} (WA{' '}
                    {selectedOrder.customerWhatsapp})
                  </p>
                  {selectedOrder.customerNote && (
                    <p className="text-xs text-slate-500">
                      Catatan pelanggan: {selectedOrder.customerNote}
                    </p>
                  )}
                </div>
                <div className="sm:text-right space-y-1">
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {formatRupiah(selectedOrder.totalAmount)}
                  </p>
                  <StatusLabel status={selectedOrder.status} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Bukti Pembayaran ({selectedOrder.paymentMethod === 'balance' ? 'Saldo Akun' : 'QRIS Owner'})
                </p>
                {selectedOrder.paymentMethod === 'balance' ? (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    Pesanan ini dibayar otomatis menggunakan Saldo Akun pengguna.
                  </p>
                ) : selectedOrder.paymentProofUrl ? (
                  <div className="flex flex-col sm:flex-row gap-4 items-start bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() =>
                        setZoomImageUrl(selectedOrder.paymentProofUrl)
                      }
                      className="border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0"
                    >
                      <img
                        src={selectedOrder.paymentProofUrl}
                        alt="Bukti bayar"
                        referrerPolicy="no-referrer"
                        className="h-36 w-auto object-contain"
                      />
                    </button>
                    <div className="space-y-1 text-xs text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-900">
                          Pengirim:
                        </span>{' '}
                        {selectedOrder.paymentSenderName || '-'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-900">
                          Waktu Upload:
                        </span>{' '}
                        {formatDateTime(selectedOrder.paidAt)}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setZoomImageUrl(selectedOrder.paymentProofUrl)
                        }
                        className="mt-1 inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> Perbesar Bukti Transfer
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    Pelanggan belum mengunggah bukti transfer.
                  </p>
                )}
              </div>

              {/* Real SMS Provider API Info & Actions */}
              {(settings?.nokosProviderMode !== 'manual' ||
                selectedOrder.providerActivationId ||
                selectedOrder.providerError ||
                selectedOrder.otpSmsText) && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      Integrasi Provider Nokos Real ({selectedOrder.providerMode === 'fivesim' ? '5sim.net' : selectedOrder.providerMode === 'sms_activate' ? 'SMS-Activate API' : settings?.nokosProviderMode})
                    </span>
                    {selectedOrder.providerActivationId && (
                      <span className="font-mono text-slate-600">
                        ID Aktivasi: {selectedOrder.providerActivationId}
                      </span>
                    )}
                  </div>

                  {selectedOrder.otpSmsText && (
                    <p className="text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 font-mono">
                      SMS Masuk: {selectedOrder.otpSmsText}
                    </p>
                  )}

                  {selectedOrder.providerError && (
                    <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-1.5">
                      {selectedOrder.providerError}
                    </p>
                  )}

                  {providerOrderMsg && (
                    <p className="text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5">
                      {providerOrderMsg}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {settings?.nokosProviderMode !== 'manual' &&
                      !selectedOrder.assignedNumber && (
                        <button
                          type="button"
                          disabled={providerOrderBusy}
                          onClick={() => void handleOrderProviderAction('provision')}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold rounded-md transition-colors"
                        >
                          {providerOrderBusy
                            ? 'Mengambil Nomor...'
                            : 'Ambil Nomor Real dari Provider'}
                        </button>
                      )}
                    {selectedOrder.providerActivationId && (
                      <>
                        <button
                          type="button"
                          disabled={providerOrderBusy}
                          onClick={() => void handleOrderProviderAction('check_otp')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-md transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${providerOrderBusy ? 'animate-spin' : ''}`} />
                          <span>Cek OTP SMS Masuk</span>
                        </button>
                        <button
                          type="button"
                          disabled={providerOrderBusy}
                          onClick={() => void handleOrderProviderAction('cancel_provider')}
                          className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 font-semibold rounded-md transition-colors"
                        >
                          Batalkan di Provider
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nomor Nokos Asli yang Diberikan
                    </label>
                    <input
                      type="text"
                      value={actionNumber}
                      onChange={(e) => setActionNumber(e.target.value)}
                      placeholder="Contoh: +6285172018890"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kode OTP Asli Masuk (isi saat SMS masuk)
                    </label>
                    <input
                      type="text"
                      value={actionOtp}
                      onChange={(e) => setActionOtp(e.target.value)}
                      placeholder="Contoh: 482910"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan Admin / Alasan Penolakan (tampil ke pelanggan)
                  </label>
                  <input
                    type="text"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Contoh: Silakan input nomor di atas ke aplikasi, lalu klik Cek OTP."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {actionError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  {actionError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  {(selectedOrder.status === 'pending_verification' ||
                    selectedOrder.status === 'awaiting_payment') && (
                    <button
                      type="button"
                      disabled={actionSaving}
                      onClick={() => void handleOrderAction('verify')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Verifikasi & Proses
                    </button>
                  )}
                  {(selectedOrder.status === 'processing' ||
                    selectedOrder.status === 'completed') && (
                    <button
                      type="button"
                      disabled={actionSaving}
                      onClick={() => void handleOrderAction('update_delivery')}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Kirim Update Nomor / OTP
                    </button>
                  )}
                  {selectedOrder.status !== 'completed' && (
                    <button
                      type="button"
                      disabled={actionSaving}
                      onClick={() => void handleOrderAction('complete')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tandai Selesai</span>
                    </button>
                  )}
                  {selectedOrder.status !== 'rejected' &&
                    selectedOrder.status !== 'completed' && (
                      <button
                        type="button"
                        disabled={actionSaving}
                        onClick={() => void handleOrderAction('reject')}
                        className="px-3.5 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Tolak
                      </button>
                    )}
                </div>

                <a
                  href={buildWaUrl(
                    selectedOrder.customerWhatsapp,
                    [
                      `Halo ${selectedOrder.customerName}, update pesanan ${selectedOrder.id} (${selectedOrder.appName}):`,
                      actionNumber ? `Nomor Nokos: ${actionNumber}` : '',
                      actionOtp ? `Kode OTP: ${actionOtp}` : '',
                      actionNote ? `Catatan: ${actionNote}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n')
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WA Pelanggan</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Owner Manage Customer Account Modal */}
      {managingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  {managingUser.id} · Terdaftar {formatDateTime(managingUser.createdAt)}
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Kelola Akun Pelanggan — {managingUser.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setManagingUserId(null)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Tutup modal akun"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                <div>
                  <p className="text-slate-500">Gmail Terdaftar</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5 break-all">
                    {managingUser.email}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Nomor Aktif</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {managingUser.whatsapp}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Saldo Saat Ini</p>
                  <p className="text-base font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatRupiah(managingUser.balance)}
                  </p>
                </div>
              </div>

              {userActionErr && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                  {userActionErr}
                </p>
              )}
              {userActionMsg && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  {userActionMsg}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <form
                  onSubmit={handleOwnerResetUserCreds}
                  className="border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <KeyRound className="w-4 h-4 text-slate-700" />
                    <span>Ubah Username & Kata Sandi</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Username Pelanggan
                    </label>
                    <input
                      type="text"
                      required
                      value={resetUserName}
                      onChange={(e) => setResetUserName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kata Sandi Baru (kosongkan jika hanya ubah username)
                    </label>
                    <input
                      type="password"
                      value={resetUserPassword}
                      onChange={(e) => setResetUserPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={userActionBusy}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Simpan Username / Reset Sandi
                  </button>
                </form>

                <form
                  onSubmit={handleOwnerAdjustBalance}
                  className="border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Wallet className="w-4 h-4 text-emerald-700" />
                    <span>Tambah / Kurangi Saldo</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nominal Perubahan (IDR)
                    </label>
                    <input
                      type="number"
                      step={500}
                      required
                      value={adjustDelta}
                      onChange={(e) => setAdjustDelta(e.target.value)}
                      placeholder="Contoh: 10000 atau -5000"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Keterangan Mutasi
                    </label>
                    <input
                      type="text"
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      placeholder="Contoh: Bonus / Koreksi saldo"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={userActionBusy}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Terapkan Penyesuaian Saldo
                  </button>
                </form>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Mutasi Saldo Terakhir
                </h3>
                {walletTransactions.filter((t) => t.userId === managingUser.id).length ===
                0 ? (
                  <p className="text-xs text-slate-500">Belum ada mutasi saldo.</p>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {walletTransactions
                      .filter((t) => t.userId === managingUser.id)
                      .slice(0, 8)
                      .map((tx) => (
                        <div
                          key={tx.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {tx.description}
                            </p>
                            <p className="font-mono text-slate-400 tabular-nums">
                              {formatDateTime(tx.createdAt)}
                            </p>
                          </div>
                          <span
                            className={`font-mono font-bold tabular-nums shrink-0 ${
                              tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {tx.amount >= 0 ? `+${formatRupiah(tx.amount)}` : formatRupiah(tx.amount)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Topup Reason Modal (replaces window.prompt) */}
      {rejectingTopupId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejectTopupReason.trim()) return;
              void handleTopupAction(rejectingTopupId, 'reject', rejectTopupReason);
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Tolak Permintaan Isi Saldo
              </h3>
              <button
                type="button"
                onClick={() => setRejectingTopupId(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alasan Penolakan (terlihat oleh pelanggan)
              </label>
              <input
                type="text"
                required
                autoFocus
                value={rejectTopupReason}
                onChange={(e) => setRejectTopupReason(e.target.value)}
                placeholder="Contoh: Bukti transfer tidak terbaca / nominal tidak sesuai"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingTopupId(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={Boolean(topupActionBusyId) || !rejectTopupReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg"
              >
                Tolak Isi Saldo
              </button>
            </div>
          </form>
        </div>
      )}

      {resettingRental && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cleanPass = resetRentalPasswordInput.trim();
              if (cleanPass.length < 6) return;
              void handlePatchRental(
                resettingRental.id,
                { newPassword: cleanPass },
                cleanPass
              );
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Reset Kata Sandi Akun Sewa
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  {resettingRental.tenantName} (@{resettingRental.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResettingRental(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kata Sandi Baru (min. 6 karakter)
              </label>
              <input
                type="text"
                required
                minLength={6}
                autoFocus
                value={resetRentalPasswordInput}
                onChange={(e) => setResetRentalPasswordInput(e.target.value)}
                placeholder="Masukkan kata sandi baru"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setResettingRental(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={
                  rentalRowBusyId === resettingRental.id ||
                  resetRentalPasswordInput.trim().length < 6
                }
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg"
              >
                Simpan & Perbarui Kartu Akun
              </button>
            </div>
          </form>
        </div>
      )}

      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => setZoomImageUrl(null)}
        >
          <img
            src={zoomImageUrl}
            alt="Bukti transfer ukuran penuh"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-lg bg-white p-2"
          />
        </div>
      )}
    </div>
  );
}
