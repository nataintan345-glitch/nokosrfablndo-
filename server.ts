import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response, type NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  BroadcastAnnouncement,
  BroadcastPriority,
  ChatMessage,
  ChatThread,
  DashboardRole,
  NokosOrder,
  NokosProviderMode,
  NokosService,
  OrderPaymentMethod,
  OrderStatus,
  OwnerSettings,
  PublicCustomerUser,
  PublicRentalAccount,
  PublicRentalLockState,
  PublicOwnerSession,
  PublicStoreOperationState,
  PublicStoreSettings,
  RentalControlSettings,
  SecurityAuditLog,
  SecurityLogLevel,
  StoreOperationMode,
  StoreOperationSettings,
  TenantOrderStatus,
  TenantWorkspaceData,
  TenantWorkspaceOrder,
  TenantWorkspaceService,
  TopUpRequest,
  WalletTransaction,
  WeekdayCode,
  WhatsAppNotifLog,
} from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'database.json');
const DB_BACKUP_PATH = path.join(DATA_DIR, 'database.backup.json');
const ACCOUNTS_VAULT_PATH = path.join(DATA_DIR, 'accounts.vault.json');

interface AuthSession {
  id?: string;
  token: string;
  role?: DashboardRole;
  rentalId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  uaHash?: string;
  createdAt: string;
  lastSeenAt?: string;
  expiresAt: number;
}

interface StoredCustomerUser extends PublicCustomerUser {
  passwordHash: string;
  salt: string;
}

interface StoredRentalAccount extends PublicRentalAccount {
  passwordHash: string;
  salt: string;
  workspace?: TenantWorkspaceData;
}

interface DatabaseSchema {
  ownerAuth: {
    initialized: boolean;
    ownerEmail: string;
    passwordHash: string | null;
    salt: string | null;
    sessions: AuthSession[];
  };
  securityLogs: SecurityAuditLog[];
  rentalAccounts: StoredRentalAccount[];
  rentalControl: RentalControlSettings;
  storeOperation: StoreOperationSettings;
  users: StoredCustomerUser[];
  userSessions: AuthSession[];
  settings: OwnerSettings;
  services: NokosService[];
  orders: NokosOrder[];
  topups: TopUpRequest[];
  walletTransactions: WalletTransaction[];
  chatThreads: ChatThread[];
  broadcasts: BroadcastAnnouncement[];
}

interface AccountsVaultSchema {
  savedAt: string;
  ownerAuth: {
    initialized: boolean;
    ownerEmail: string;
    passwordHash: string | null;
    salt: string | null;
  };
  users: StoredCustomerUser[];
}

const DEFAULT_OWNER_EMAIL = 'nataintan345@gmail.com';
const DEFAULT_OWNER_SALT = '5c7b0ae5648613ce068e2cd5668128d51774e90231892dcd';
const DEFAULT_OWNER_HASH =
  '1086192a5bbdb04edba9ceec8f022feea674be795e84a00b06b443077490008e963c8ac6bf0c6396610a8bdf8c2011857f4989939f3f47ce280f17be00846c99';

function ensureStorageDirs(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function readAccountsVault(): AccountsVaultSchema | null {
  try {
    if (!fs.existsSync(ACCOUNTS_VAULT_PATH)) return null;
    const raw = fs.readFileSync(ACCOUNTS_VAULT_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AccountsVaultSchema>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      ownerAuth: {
        initialized: Boolean(parsed.ownerAuth?.initialized),
        ownerEmail: parsed.ownerAuth?.ownerEmail || DEFAULT_OWNER_EMAIL,
        passwordHash: parsed.ownerAuth?.passwordHash ?? null,
        salt: parsed.ownerAuth?.salt ?? null,
      },
      users: Array.isArray(parsed.users) ? parsed.users : [],
    };
  } catch {
    return null;
  }
}

function createInitialDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const initialServices: NokosService[] = [
    {
      id: 'srv-wa-id',
      appName: 'WhatsApp',
      country: 'Indonesia',
      countryCode: '+62',
      price: 6500,
      stock: 25,
      estimatedTime: '1-5 Menit',
      description: 'Nomor fresh Indonesia untuk registrasi WhatsApp pribadi maupun bisnis.',
      active: true,
      providerProductCode: 'whatsapp',
      providerCountryCode: 'indonesia',
      updatedAt: now,
    },
    {
      id: 'srv-tg-id',
      appName: 'Telegram',
      country: 'Indonesia',
      countryCode: '+62',
      price: 5500,
      stock: 30,
      estimatedTime: '1-5 Menit',
      description: 'Nomor virtual Indonesia siap terima OTP masuk Telegram.',
      active: true,
      providerProductCode: 'telegram',
      providerCountryCode: 'indonesia',
      updatedAt: now,
    },
    {
      id: 'srv-shopee-id',
      appName: 'Shopee',
      country: 'Indonesia',
      countryCode: '+62',
      price: 5000,
      stock: 20,
      estimatedTime: '2-5 Menit',
      description: 'Verifikasi akun baru Shopee Indonesia dengan garansi OTP pertama.',
      active: true,
      providerProductCode: 'shopee',
      providerCountryCode: 'indonesia',
      updatedAt: now,
    },
    {
      id: 'srv-tiktok-id',
      appName: 'TikTok',
      country: 'Indonesia',
      countryCode: '+62',
      price: 4500,
      stock: 18,
      estimatedTime: '1-5 Menit',
      description: 'Aktivasi akun TikTok baru tanpa kartu SIM fisik.',
      active: true,
      providerProductCode: 'tiktok',
      providerCountryCode: 'indonesia',
      updatedAt: now,
    },
    {
      id: 'srv-google-id',
      appName: 'Google / Gmail',
      country: 'Indonesia',
      countryCode: '+62',
      price: 5000,
      stock: 22,
      estimatedTime: '1-5 Menit',
      description: 'Nomor verifikasi SMS pembuatan akun Google / YouTube.',
      active: true,
      providerProductCode: 'google',
      providerCountryCode: 'indonesia',
      updatedAt: now,
    },
    {
      id: 'srv-wa-my',
      appName: 'WhatsApp',
      country: 'Malaysia',
      countryCode: '+60',
      price: 9000,
      stock: 12,
      estimatedTime: '2-7 Menit',
      description: 'Nomor Malaysia (+60) bersih untuk verifikasi WhatsApp internasional.',
      active: true,
      providerProductCode: 'whatsapp',
      providerCountryCode: 'malaysia',
      updatedAt: now,
    },
    {
      id: 'srv-tg-us',
      appName: 'Telegram',
      country: 'Amerika Serikat',
      countryCode: '+1',
      price: 11000,
      stock: 15,
      estimatedTime: '2-7 Menit',
      description: 'Nomor USA (+1) stabil untuk registrasi akun Telegram.',
      active: true,
      providerProductCode: 'telegram',
      providerCountryCode: 'usa',
      updatedAt: now,
    },
    {
      id: 'srv-ig-id',
      appName: 'Instagram',
      country: 'Indonesia',
      countryCode: '+62',
      price: 4500,
      stock: 20,
      estimatedTime: '1-5 Menit',
      description: 'Verifikasi nomor HP akun Instagram baru.',
      active: true,
      providerProductCode: 'instagram',
      providerCountryCode: 'indonesia',
      updatedAt: now,
    },
  ];

  const ownerCustomerUser: StoredCustomerUser = {
    id: 'usr-owner-primary',
    name: 'RFABLNDO (Owner)',
    email: DEFAULT_OWNER_EMAIL,
    whatsapp: '620000000000',
    balance: 0,
    passwordHash: DEFAULT_OWNER_HASH,
    salt: DEFAULT_OWNER_SALT,
    createdAt: now,
  };

  return {
    ownerAuth: {
      initialized: true,
      ownerEmail: DEFAULT_OWNER_EMAIL,
      passwordHash: DEFAULT_OWNER_HASH,
      salt: DEFAULT_OWNER_SALT,
      sessions: [],
    },
    securityLogs: [],
    rentalAccounts: [],
    rentalControl: {
      webLockMode: false,
      lockMessage:
        'Masa sewa website telah berakhir. Hubungi Owner untuk perpanjangan layanan.',
    },
    storeOperation: {
      mode: 'open',
      autoBySchedule: false,
      openDays: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
      openTime: '08:00',
      closeTime: '22:00',
      openDescription:
        'Layanan order Nokos & pengisian saldo aktif penuh. OTP masuk otomatis & cepat.',
      closeDescription:
        'Toko sedang tutup sementara di luar jam operasional. Pesanan dibuka kembali sesuai jadwal.',
      maintenanceDescription:
        'Sistem sedang dalam pemeliharaan/update server agar layanan makin lancar. Mohon tunggu sebentar.',
      updatedAt: now,
    },
    users: [ownerCustomerUser],
    userSessions: [],
    settings: {
      storeName: 'nokosrfablndo',
      ownerWhatsapp: '',
      ownerTelegram: '',
      qrisImageUrl: null,
      qrisMerchantName: 'nokosrfablndo Official',
      paymentInstruction:
        'Scan QRIS di atas sesuai nominal total, lalu unggah screenshot bukti pembayaran untuk diverifikasi admin.',
      whatsappMode: 'direct',
      whatsappApiToken: '',
      whatsappWebhookUrl: '',
      notifyOnNewOrder: true,
      notifyOnPaymentProof: true,
      nokosProviderMode: 'manual',
      nokosApiKey: '',
      nokosBaseUrl: '',
    },
    services: initialServices,
    orders: [],
    topups: [],
    walletTransactions: [],
    chatThreads: [],
    broadcasts: [],
  };
}

function loadDatabase(): DatabaseSchema {
  ensureStorageDirs();
  const targetFile = fs.existsSync(DB_PATH)
    ? DB_PATH
    : fs.existsSync(DB_BACKUP_PATH)
      ? DB_BACKUP_PATH
      : null;

  if (!targetFile) {
    const initial = createInitialDatabase();
    saveDatabase(initial);
    return initial;
  }

  let parsed: Partial<DatabaseSchema> = {};
  try {
    const raw = fs.readFileSync(targetFile, 'utf-8');
    parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
  } catch {
    if (targetFile === DB_PATH && fs.existsSync(DB_BACKUP_PATH)) {
      const backupRaw = fs.readFileSync(DB_BACKUP_PATH, 'utf-8');
      parsed = JSON.parse(backupRaw) as Partial<DatabaseSchema>;
    } else {
      const initial = createInitialDatabase();
      saveDatabase(initial);
      return initial;
    }
  }

  const nowMs = Date.now();
  const base = createInitialDatabase();
  const loadedSettings = {
    ...base.settings,
    ...(parsed.settings || {}),
    ownerTelegram: parsed.settings?.ownerTelegram || '',
  };
  if (loadedSettings.storeName === 'NokosDirect') {
    loadedSettings.storeName = 'nokosrfablndo';
  }
  if (loadedSettings.qrisMerchantName === 'NokosDirect Official') {
    loadedSettings.qrisMerchantName = 'nokosrfablndo Official';
  }

  const rawOwnerAuth = (parsed.ownerAuth || {}) as Partial<
    DatabaseSchema['ownerAuth']
  >;
  const needsOwnerSeed =
    !rawOwnerAuth.initialized ||
    !rawOwnerAuth.passwordHash ||
    !rawOwnerAuth.salt ||
    !rawOwnerAuth.ownerEmail;

  const vault = readAccountsVault();
  const mergedUsersMap = new Map<string, StoredCustomerUser>();
  for (const vu of vault?.users || []) {
    if (vu && vu.id && vu.email) {
      mergedUsersMap.set(vu.id, vu);
    }
  }
  for (const pu of Array.isArray(parsed.users) ? parsed.users : []) {
    if (pu && pu.id && pu.email) {
      mergedUsersMap.set(pu.id, pu);
    }
  }
  const mergedUsers = Array.from(mergedUsersMap.values());

  const mergedOwnerEmail = (
    rawOwnerAuth.ownerEmail ||
    vault?.ownerAuth?.ownerEmail ||
    DEFAULT_OWNER_EMAIL
  )
    .trim()
    .toLowerCase();
  const mergedOwnerHash = needsOwnerSeed
    ? vault?.ownerAuth?.passwordHash || DEFAULT_OWNER_HASH
    : rawOwnerAuth.passwordHash || DEFAULT_OWNER_HASH;
  const mergedOwnerSalt = needsOwnerSeed
    ? vault?.ownerAuth?.salt || DEFAULT_OWNER_SALT
    : rawOwnerAuth.salt || DEFAULT_OWNER_SALT;

  let seededOwnerUser = false;
  const existingOwnerUserIdx = mergedUsers.findIndex(
    (u) => u.id === 'usr-owner-primary' || u.email.trim().toLowerCase() === mergedOwnerEmail
  );
  if (existingOwnerUserIdx === -1) {
    mergedUsers.unshift({
      id: 'usr-owner-primary',
      name: 'RFABLNDO (Owner)',
      email: mergedOwnerEmail,
      whatsapp: normalizeWhatsappNumber(loadedSettings.ownerWhatsapp || '') || '620000000000',
      balance: 0,
      passwordHash: mergedOwnerHash,
      salt: mergedOwnerSalt,
      createdAt: new Date(nowMs).toISOString(),
    });
    seededOwnerUser = true;
  } else {
    const existing = mergedUsers[existingOwnerUserIdx];
    if (
      existing.passwordHash !== mergedOwnerHash ||
      existing.salt !== mergedOwnerSalt ||
      existing.email !== mergedOwnerEmail
    ) {
      existing.email = mergedOwnerEmail;
      existing.passwordHash = mergedOwnerHash;
      existing.salt = mergedOwnerSalt;
      seededOwnerUser = true;
    }
  }

  const validDaysSet = new Set<WeekdayCode>([
    'Sen',
    'Sel',
    'Rab',
    'Kam',
    'Jum',
    'Sab',
    'Min',
  ]);
  const rawOp = parsed.storeOperation as Partial<StoreOperationSettings> | undefined;
  const parsedDays = Array.isArray(rawOp?.openDays)
    ? rawOp.openDays.filter((d): d is WeekdayCode => validDaysSet.has(d))
    : [];
  const loadedOperation: StoreOperationSettings = {
    mode:
      rawOp?.mode === 'open' ||
      rawOp?.mode === 'close' ||
      rawOp?.mode === 'maintenance'
        ? rawOp.mode
        : base.storeOperation.mode,
    autoBySchedule: Boolean(rawOp?.autoBySchedule),
    openDays: parsedDays.length > 0 ? parsedDays : base.storeOperation.openDays,
    openTime:
      typeof rawOp?.openTime === 'string' && /^\d{2}:\d{2}$/.test(rawOp.openTime)
        ? rawOp.openTime
        : base.storeOperation.openTime,
    closeTime:
      typeof rawOp?.closeTime === 'string' && /^\d{2}:\d{2}$/.test(rawOp.closeTime)
        ? rawOp.closeTime
        : base.storeOperation.closeTime,
    openDescription:
      typeof rawOp?.openDescription === 'string' && rawOp.openDescription.trim()
        ? rawOp.openDescription.trim()
        : base.storeOperation.openDescription,
    closeDescription:
      typeof rawOp?.closeDescription === 'string' && rawOp.closeDescription.trim()
        ? rawOp.closeDescription.trim()
        : base.storeOperation.closeDescription,
    maintenanceDescription:
      typeof rawOp?.maintenanceDescription === 'string' &&
      rawOp.maintenanceDescription.trim()
        ? rawOp.maintenanceDescription.trim()
        : base.storeOperation.maintenanceDescription,
    updatedAt:
      typeof rawOp?.updatedAt === 'string' ? rawOp.updatedAt : base.storeOperation.updatedAt,
  };

  const merged: DatabaseSchema = {
    ownerAuth: {
      initialized: true,
      ownerEmail: mergedOwnerEmail,
      passwordHash: mergedOwnerHash,
      salt: mergedOwnerSalt,
      sessions: (rawOwnerAuth.sessions || []).filter((s) => s.expiresAt > nowMs),
    },
    securityLogs: Array.isArray(parsed.securityLogs)
      ? parsed.securityLogs.slice(0, 150)
      : [],
    rentalAccounts: parsed.rentalAccounts || [],
    rentalControl: {
      webLockMode: Boolean(parsed.rentalControl?.webLockMode),
      lockMessage:
        parsed.rentalControl?.lockMessage || base.rentalControl.lockMessage,
    },
    storeOperation: loadedOperation,
    users: mergedUsers,
    userSessions: (parsed.userSessions || []).filter((s) => s.expiresAt > nowMs),
    settings: loadedSettings,
    services: parsed.services || base.services,
    orders: (parsed.orders || []).map((o) => ({
      ...o,
      userId: o.userId ?? null,
      paymentMethod: o.paymentMethod ?? 'qris',
      otpSmsText: o.otpSmsText ?? null,
      providerActivationId: o.providerActivationId ?? null,
      providerMode: o.providerMode ?? 'manual',
      providerError: o.providerError ?? null,
    })),
    topups: parsed.topups || [],
    walletTransactions: parsed.walletTransactions || [],
    chatThreads: parsed.chatThreads || [],
    broadcasts: parsed.broadcasts || [],
  };

  if (needsOwnerSeed || seededOwnerUser || !parsed.storeOperation || !fs.existsSync(ACCOUNTS_VAULT_PATH)) {
    saveDatabase(merged);
  }

  return merged;
}

function saveDatabase(database: DatabaseSchema): void {
  ensureStorageDirs();
  const serialized = JSON.stringify(database, null, 2);
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, serialized, 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
  const backupTmp = `${DB_BACKUP_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(backupTmp, serialized, 'utf-8');
  fs.renameSync(backupTmp, DB_BACKUP_PATH);

  // Redundant permanent account vault (preserves ownerAuth + all registered customer accounts)
  const vaultPayload: AccountsVaultSchema = {
    savedAt: new Date().toISOString(),
    ownerAuth: {
      initialized: database.ownerAuth.initialized,
      ownerEmail: database.ownerAuth.ownerEmail,
      passwordHash: database.ownerAuth.passwordHash,
      salt: database.ownerAuth.salt,
    },
    users: database.users,
  };
  const vaultTmp = `${ACCOUNTS_VAULT_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(vaultTmp, JSON.stringify(vaultPayload, null, 2), 'utf-8');
  fs.renameSync(vaultTmp, ACCOUNTS_VAULT_PATH);
}

let db: DatabaseSchema = loadDatabase();

// Real-time WebSocket client registries
interface ClientSocketMeta {
  ws: WebSocket;
  role: 'owner' | 'customer';
  dashboardRole?: DashboardRole;
  rentalId?: string;
  sessionToken?: string;
  userId?: string;
  watchedOrderIds: Set<string>;
}

const wsClients = new Set<ClientSocketMeta>();

function sendWsMessage(ws: WebSocket, event: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, payload }));
  }
}

function broadcastToOwners(event: string, payload: unknown): void {
  for (const client of wsClients) {
    if (client.role === 'owner' && client.dashboardRole === 'owner') {
      sendWsMessage(client.ws, event, payload);
    }
  }
}

function broadcastToPrimaryOwners(event: string, payload: unknown): void {
  for (const client of wsClients) {
    if (client.role === 'owner' && client.dashboardRole === 'owner') {
      sendWsMessage(client.ws, event, payload);
    }
  }
}

function broadcastToTenant(rentalId: string, event: string, payload: unknown): void {
  for (const client of wsClients) {
    if (
      client.role === 'owner' &&
      client.dashboardRole === 'tenant' &&
      client.rentalId === rentalId
    ) {
      sendWsMessage(client.ws, event, payload);
    }
  }
}

function evictOwnerSocketsByTokens(tokens: Set<string>, reason: string): void {
  for (const client of wsClients) {
    if (
      client.role === 'owner' &&
      client.dashboardRole === 'owner' &&
      client.sessionToken &&
      tokens.has(client.sessionToken)
    ) {
      sendWsMessage(client.ws, 'security:alert', { level: 'critical', message: reason });
      try {
        client.ws.close(4003, 'Sesi dicabut');
      } catch {
        // Ignore close failure
      }
    }
  }
}

function evictTenantSockets(rentalId: string, reason: string): void {
  for (const client of wsClients) {
    if (client.role === 'owner' && client.dashboardRole === 'tenant' && client.rentalId === rentalId) {
      sendWsMessage(client.ws, 'rental:expired', { reason });
      try {
        client.ws.close(4002, 'Sewa berakhir');
      } catch {
        // Ignore close failure
      }
    }
  }
}

function broadcastToUser(userId: string | null | undefined, event: string, payload: unknown): void {
  if (!userId) return;
  for (const client of wsClients) {
    if (client.role === 'customer' && client.userId === userId) {
      sendWsMessage(client.ws, event, payload);
    }
  }
}

function broadcastOrderUpdate(order: NokosOrder): void {
  broadcastToOwners('order:update', order);
  for (const client of wsClients) {
    if (client.role === 'customer') {
      if (
        (order.userId && client.userId === order.userId) ||
        client.watchedOrderIds.has(order.id)
      ) {
        sendWsMessage(client.ws, 'order:update', order);
      }
    }
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const computed = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function constantTimeEmailMatch(inputEmail: string, storedEmail: string): boolean {
  const a = crypto.createHash('sha256').update(inputEmail.trim().toLowerCase()).digest();
  const b = crypto.createHash('sha256').update(storedEmail.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(a, b);
}

function getClientIp(req: Request | http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff || req.socket?.remoteAddress || 'unknown';
  return String(raw).split(',')[0].trim().slice(0, 64) || 'unknown';
}

function getClientUserAgent(req: Request | http.IncomingMessage): string {
  return String(req.headers['user-agent'] || 'unknown').trim().slice(0, 220) || 'unknown';
}

function hashUserAgent(ua: string): string {
  return crypto.createHash('sha256').update(ua || 'unknown').digest('hex');
}

function maskEmailForLog(email: string): string {
  const clean = email.trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 1) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx);
  return `${local.slice(0, 2)}***${domain}`;
}

interface RateLimitBucket {
  count: number;
  firstAttemptMs: number;
  lockedUntilMs: number;
}

const authRateLimiter = new Map<string, RateLimitBucket>();

function checkAuthLockout(key: string): { locked: boolean; remainingSeconds: number } {
  const bucket = authRateLimiter.get(key);
  if (!bucket) return { locked: false, remainingSeconds: 0 };
  const now = Date.now();
  if (bucket.lockedUntilMs > now) {
    return {
      locked: true,
      remainingSeconds: Math.max(1, Math.ceil((bucket.lockedUntilMs - now) / 1000)),
    };
  }
  if (now - bucket.firstAttemptMs > 15 * 60 * 1000) {
    authRateLimiter.delete(key);
    return { locked: false, remainingSeconds: 0 };
  }
  return { locked: false, remainingSeconds: 0 };
}

function recordAuthFailure(
  key: string,
  thresholds: { count: number; lockSeconds: number }[]
): { count: number; lockedSeconds: number } {
  const now = Date.now();
  const existing = authRateLimiter.get(key);
  let bucket: RateLimitBucket;
  if (!existing || now - existing.firstAttemptMs > 15 * 60 * 1000) {
    bucket = { count: 1, firstAttemptMs: now, lockedUntilMs: 0 };
  } else {
    bucket = {
      count: existing.count + 1,
      firstAttemptMs: existing.firstAttemptMs,
      lockedUntilMs: existing.lockedUntilMs,
    };
  }

  let appliedLockSeconds = 0;
  for (const rule of thresholds) {
    if (bucket.count >= rule.count) {
      appliedLockSeconds = Math.max(appliedLockSeconds, rule.lockSeconds);
    }
  }
  if (appliedLockSeconds > 0) {
    bucket.lockedUntilMs = Math.max(bucket.lockedUntilMs, now + appliedLockSeconds * 1000);
  }
  authRateLimiter.set(key, bucket);
  return { count: bucket.count, lockedSeconds: appliedLockSeconds };
}

function clearAuthFailures(key: string): void {
  authRateLimiter.delete(key);
}

function appendSecurityLog(
  level: SecurityLogLevel,
  event: string,
  detail: string,
  ip: string,
  userAgent: string,
  notifyAlert = false
): SecurityAuditLog {
  const entry: SecurityAuditLog = {
    id: `sec-${crypto.randomBytes(4).toString('hex')}`,
    level,
    event,
    detail: detail.slice(0, 320),
    ip: ip.slice(0, 64),
    userAgent: userAgent.slice(0, 160),
    timestamp: new Date().toISOString(),
  };
  db.securityLogs.unshift(entry);
  if (db.securityLogs.length > 150) {
    db.securityLogs = db.securityLogs.slice(0, 150);
  }
  saveDatabase(db);
  broadcastToPrimaryOwners('security:log', entry);
  if (notifyAlert) {
    broadcastToPrimaryOwners('security:alert', {
      level,
      message: `${event}: ${detail}`,
      ip,
      timestamp: entry.timestamp,
    });
  }
  return entry;
}

function toPublicOwnerSessions(currentToken: string | null): PublicOwnerSession[] {
  const nowMs = Date.now();
  return db.ownerAuth.sessions
    .filter((s) => (s.role || 'owner') === 'owner' && s.expiresAt > nowMs)
    .map((s) => ({
      id: s.id || s.token.slice(0, 10),
      ip: s.ip || 'unknown',
      userAgent: s.userAgent || 'Browser',
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt || s.createdAt,
      expiresAt: new Date(s.expiresAt).toISOString(),
      current: Boolean(currentToken && s.token === currentToken),
    }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function normalizeWhatsappNumber(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatWibTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const OWNER_USER_ID = 'usr-owner-primary';

function isReservedOwnerUser(u: StoredCustomerUser): boolean {
  return (
    u.id === OWNER_USER_ID ||
    u.email.trim().toLowerCase() === db.ownerAuth.ownerEmail.trim().toLowerCase()
  );
}

function ensureOwnerCustomerRecord(): StoredCustomerUser {
  const ownerEmail = db.ownerAuth.ownerEmail.trim().toLowerCase();
  const ownerHash = db.ownerAuth.passwordHash || DEFAULT_OWNER_HASH;
  const ownerSalt = db.ownerAuth.salt || DEFAULT_OWNER_SALT;
  let existing = db.users.find(
    (u) => u.id === OWNER_USER_ID || u.email.trim().toLowerCase() === ownerEmail
  );
  if (!existing) {
    existing = {
      id: OWNER_USER_ID,
      name: 'RFABLNDO (Owner)',
      email: ownerEmail,
      whatsapp:
        normalizeWhatsappNumber(db.settings.ownerWhatsapp || '') || '620000000000',
      balance: 0,
      passwordHash: ownerHash,
      salt: ownerSalt,
      createdAt: new Date().toISOString(),
    };
    db.users.unshift(existing);
  } else {
    existing.email = ownerEmail;
    existing.passwordHash = ownerHash;
    existing.salt = ownerSalt;
  }
  return existing;
}

function toPublicUser(u: StoredCustomerUser): PublicCustomerUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    whatsapp: u.whatsapp,
    balance: u.balance,
    createdAt: u.createdAt,
  };
}

function ensureTenantWorkspace(rental: StoredRentalAccount): TenantWorkspaceData {
  if (!rental.workspace || typeof rental.workspace !== 'object') {
    const now = new Date().toISOString();
    rental.workspace = {
      storeTitle: `${rental.tenantName} Nokos`,
      whatsapp: rental.tenantWhatsapp || '',
      telegram: '',
      qrisMerchantName: `${rental.tenantName} Official`,
      qrisImageUrl: null,
      paymentInstruction:
        'Scan QRIS di atas sesuai nominal pembayaran lalu konfirmasi bukti transfer ke admin.',
      services: [
        {
          id: `tsrv-${crypto.randomBytes(3).toString('hex')}`,
          appName: 'WhatsApp',
          country: 'Indonesia',
          countryCode: '+62',
          price: 6500,
          stock: 20,
          estimatedTime: '1-5 Menit',
          active: true,
          updatedAt: now,
        },
        {
          id: `tsrv-${crypto.randomBytes(3).toString('hex')}`,
          appName: 'Telegram',
          country: 'Indonesia',
          countryCode: '+62',
          price: 5500,
          stock: 20,
          estimatedTime: '1-5 Menit',
          active: true,
          updatedAt: now,
        },
      ],
      orders: [],
      updatedAt: now,
    };
  }
  return rental.workspace;
}

function broadcastToAll(event: string, payload: unknown): void {
  for (const client of wsClients) {
    sendWsMessage(client.ws, event, payload);
  }
}

function normalizeTelegramUsername(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 32);
  return cleaned;
}

function getPublicSettings(settings: OwnerSettings): PublicStoreSettings {
  return {
    storeName: settings.storeName,
    ownerWhatsapp: settings.ownerWhatsapp,
    ownerTelegram: settings.ownerTelegram || '',
    qrisImageUrl: settings.qrisImageUrl,
    qrisMerchantName: settings.qrisMerchantName,
    paymentInstruction: settings.paymentInstruction,
    whatsappMode: settings.whatsappMode,
  };
}

function toPublicRental(r: StoredRentalAccount): PublicRentalAccount {
  return {
    id: r.id,
    tenantName: r.tenantName,
    username: r.username,
    tenantWhatsapp: r.tenantWhatsapp,
    durationDays: r.durationDays,
    priceAmount: r.priceAmount,
    note: r.note,
    status: r.status,
    startedAt: r.startedAt,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastLoginAt: r.lastLoginAt,
  };
}

let lastBroadcastedWebLock: boolean | null = null;

function syncExpiredRentals(): boolean {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiredIds: string[] = [];

  for (const rental of db.rentalAccounts) {
    if (rental.status === 'active' && Date.parse(rental.expiresAt) <= nowMs) {
      rental.status = 'expired';
      rental.updatedAt = nowIso;
      expiredIds.push(rental.id);
    }
  }

  if (expiredIds.length > 0) {
    const expSet = new Set(expiredIds);
    db.ownerAuth.sessions = db.ownerAuth.sessions.filter(
      (s) => !s.rentalId || !expSet.has(s.rentalId)
    );
    saveDatabase(db);
    for (const rid of expiredIds) {
      evictTenantSockets(
        rid,
        'Masa sewa akun dashboard Anda telah berakhir. Hubungi Owner untuk perpanjangan.'
      );
    }
    broadcastToPrimaryOwners(
      'rental:sync',
      db.rentalAccounts.map(toPublicRental)
    );
  }

  const lockState = computePublicRentalLockState();
  if (lastBroadcastedWebLock !== null && lastBroadcastedWebLock !== lockState.locked) {
    broadcastToAll('rental:web_state', lockState);
  }
  lastBroadcastedWebLock = lockState.locked;

  return expiredIds.length > 0;
}

function computePublicRentalLockState(): PublicRentalLockState {
  if (!db.rentalControl.webLockMode) {
    return {
      locked: false,
      reason: '',
      expiresAt: null,
      activeTenantName: null,
    };
  }
  const nowMs = Date.now();
  const activeRentals = db.rentalAccounts
    .filter((r) => r.status === 'active' && Date.parse(r.expiresAt) > nowMs)
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));

  if (activeRentals.length > 0) {
    return {
      locked: false,
      reason: '',
      expiresAt: activeRentals[0].expiresAt,
      activeTenantName: activeRentals[0].tenantName,
    };
  }

  return {
    locked: true,
    reason:
      db.rentalControl.lockMessage ||
      'Masa sewa website telah berakhir. Hubungi Owner untuk perpanjangan.',
    expiresAt: null,
    activeTenantName: null,
  };
}

const WEEKDAY_ORDER: WeekdayCode[] = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const WEEKDAY_FULL_NAMES: Record<WeekdayCode, string> = {
  Sen: 'Senin',
  Sel: 'Selasa',
  Rab: 'Rabu',
  Kam: 'Kamis',
  Jum: 'Jumat',
  Sab: 'Sabtu',
  Min: 'Minggu',
};

function formatDaysSummary(days: WeekdayCode[]): string {
  const ordered = WEEKDAY_ORDER.filter((d) => days.includes(d));
  if (ordered.length === 0) return 'Belum diatur';
  if (ordered.length === 7) return 'Setiap Hari (Senin - Minggu)';
  if (
    ordered.length === 5 &&
    ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'].every((d) => ordered.includes(d as WeekdayCode))
  ) {
    return 'Senin - Jumat';
  }
  return ordered.map((d) => WEEKDAY_FULL_NAMES[d]).join(', ');
}

function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

function getCurrentWibDayAndMinutes(): { day: WeekdayCode; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const weekdayRaw = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value || '0') % 24;
  const minRaw = Number(parts.find((p) => p.type === 'minute')?.value || '0');
  const map: Record<string, WeekdayCode> = {
    Mon: 'Sen',
    Tue: 'Sel',
    Wed: 'Rab',
    Thu: 'Kam',
    Fri: 'Jum',
    Sat: 'Sab',
    Sun: 'Min',
  };
  return {
    day: map[weekdayRaw] || 'Sen',
    minutes: hourRaw * 60 + minRaw,
  };
}

function computeStoreOperationState(): PublicStoreOperationState {
  const op = db.storeOperation;
  let effectiveMode: StoreOperationMode = op.mode;

  if (op.mode !== 'maintenance' && op.autoBySchedule) {
    const { day, minutes } = getCurrentWibDayAndMinutes();
    const dayOpen = op.openDays.includes(day);
    const startMin = parseTimeToMinutes(op.openTime);
    const endMin = parseTimeToMinutes(op.closeTime);
    let timeOpen = false;
    if (startMin === endMin) {
      timeOpen = true; // 24 jam
    } else if (startMin < endMin) {
      timeOpen = minutes >= startMin && minutes < endMin;
    } else {
      timeOpen = minutes >= startMin || minutes < endMin;
    }
    effectiveMode = dayOpen && timeOpen ? 'open' : 'close';
  }

  const daysText = formatDaysSummary(op.openDays);
  const hoursText =
    op.openTime === op.closeTime ? '24 Jam WIB' : `${op.openTime} - ${op.closeTime} WIB`;
  const scheduleSummary = `${daysText} · ${hoursText}`;
  const activeDescription =
    effectiveMode === 'maintenance'
      ? op.maintenanceDescription
      : effectiveMode === 'open'
        ? op.openDescription
        : op.closeDescription;

  return {
    ...op,
    effectiveMode,
    scheduleSummary,
    activeDescription,
  };
}

let lastBroadcastedOperationSignature: string | null = null;

function syncStoreOperationState(): void {
  const state = computeStoreOperationState();
  const sig = `${state.effectiveMode}|${state.scheduleSummary}|${state.activeDescription}|${state.updatedAt}`;
  if (
    lastBroadcastedOperationSignature !== null &&
    lastBroadcastedOperationSignature !== sig
  ) {
    broadcastToAll('store:operation_updated', state);
  }
  lastBroadcastedOperationSignature = sig;
}

function getPublicRentalLockState(): PublicRentalLockState {
  syncExpiredRentals();
  return computePublicRentalLockState();
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (queryToken) return queryToken;
  return null;
}

function resolveDashboardAuth(
  token: string | null,
  req?: Request | http.IncomingMessage
): {
  valid: boolean;
  role: DashboardRole;
  rental: StoredRentalAccount | null;
  hijacked?: boolean;
} {
  syncExpiredRentals();
  if (!token || !db.ownerAuth.initialized) {
    return { valid: false, role: 'owner', rental: null };
  }
  const nowMs = Date.now();
  const session = db.ownerAuth.sessions.find(
    (s) => s.token === token && s.expiresAt > nowMs
  );
  if (!session) {
    return { valid: false, role: 'owner', rental: null };
  }

  const role: DashboardRole = session.role === 'tenant' ? 'tenant' : 'owner';

  if (role === 'owner' && session.uaHash && req) {
    const incomingUa = getClientUserAgent(req);
    const incomingHash = hashUserAgent(incomingUa);
    if (incomingHash !== session.uaHash) {
      const ip = getClientIp(req);
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.token !== token);
      appendSecurityLog(
        'critical',
        'SESSION_HIJACK_BLOCKED',
        'Token sesi Owner dicoba digunakan dari browser/perangkat berbeda dan langsung dicabut.',
        ip,
        incomingUa,
        true
      );
      return { valid: false, role: 'owner', rental: null, hijacked: true };
    }
  }

  if (role === 'tenant') {
    const rental = db.rentalAccounts.find((r) => r.id === session.rentalId) || null;
    if (!rental || rental.status !== 'active' || Date.parse(rental.expiresAt) <= nowMs) {
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.token !== token);
      saveDatabase(db);
      return { valid: false, role: 'tenant', rental: null };
    }
    return { valid: true, role: 'tenant', rental };
  }

  session.lastSeenAt = new Date(nowMs).toISOString();
  return { valid: true, role: 'owner', rental: null };
}

function findUserByToken(token: string | null): StoredCustomerUser | null {
  if (!token) return null;
  const nowMs = Date.now();
  const session = db.userSessions.find((s) => s.token === token && s.expiresAt > nowMs);
  if (!session || !session.userId) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

interface AuthedDashboardRequest extends Request {
  dashboardRole?: DashboardRole;
  rentalAccount?: StoredRentalAccount | null;
  dashboardToken?: string;
}

function requireOwner(req: AuthedDashboardRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const auth = resolveDashboardAuth(token, req);
  if (!auth.valid) {
    if (token && !auth.hijacked && auth.role !== 'tenant') {
      appendSecurityLog(
        'warning',
        'UNAUTHORIZED_ADMIN_PROBE',
        `Akses endpoint ${req.method} ${req.path} ditolak karena token tidak valid.`,
        getClientIp(req),
        getClientUserAgent(req),
        false
      );
    }
    res.status(401).json({
      error: auth.hijacked
        ? 'Sesi ditolak karena perubahan sidik jari perangkat. Silakan masuk ulang.'
        : auth.role === 'tenant'
          ? 'Masa sewa akun dashboard Anda telah berakhir atau sesi tidak valid.'
          : 'Sesi owner tidak valid atau telah berakhir. Silakan masuk ulang.',
      rentalExpired: auth.role === 'tenant',
    });
    return;
  }
  req.dashboardRole = auth.role;
  req.rentalAccount = auth.rental;
  req.dashboardToken = token || undefined;
  next();
}

function requirePrimaryOwner(
  req: AuthedDashboardRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  const auth = resolveDashboardAuth(token, req);
  if (!auth.valid) {
    appendSecurityLog(
      'warning',
      'UNAUTHORIZED_OWNER_PROBE',
      `Percobaan akses endpoint khusus Owner Utama (${req.method} ${req.path}) tanpa sesi valid.`,
      getClientIp(req),
      getClientUserAgent(req),
      true
    );
    res.status(401).json({ error: 'Sesi owner tidak valid atau telah berakhir.' });
    return;
  }
  if (auth.role !== 'owner') {
    appendSecurityLog(
      'critical',
      'PRIVILEGE_ESCALATION_BLOCKED',
      `Akun sewa "${auth.rental?.username || 'unknown'}" mencoba mengakses endpoint khusus Owner Utama (${req.path}).`,
      getClientIp(req),
      getClientUserAgent(req),
      true
    );
    res.status(403).json({
      error: 'Akses ditolak. Pengaturan ini hanya dapat diakses oleh Owner Utama.',
    });
    return;
  }
  req.dashboardRole = 'owner';
  req.rentalAccount = null;
  req.dashboardToken = token || undefined;
  next();
}

function requireTenant(
  req: AuthedDashboardRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  const auth = resolveDashboardAuth(token, req);
  if (!auth.valid || auth.role !== 'tenant' || !auth.rental) {
    res.status(401).json({
      error:
        auth.role === 'tenant'
          ? 'Masa sewa akun dashboard Anda telah berakhir atau sesi tidak valid.'
          : 'Endpoint ini khusus untuk akun penyewa.',
      rentalExpired: auth.role === 'tenant',
    });
    return;
  }
  req.dashboardRole = 'tenant';
  req.rentalAccount = auth.rental;
  req.dashboardToken = token || undefined;
  next();
}

function requireWebUnlocked(_req: Request, res: Response, next: NextFunction): void {
  const lockState = getPublicRentalLockState();
  if (lockState.locked) {
    res.status(403).json({
      error: lockState.reason,
      webLocked: true,
    });
    return;
  }
  next();
}

function requireStoreOpenForOrder(_req: Request, res: Response, next: NextFunction): void {
  const op = computeStoreOperationState();
  if (op.effectiveMode === 'maintenance') {
    res.status(503).json({
      error: `Website sedang maintenance: ${op.maintenanceDescription}`,
      storeOperationMode: 'maintenance',
    });
    return;
  }
  if (op.effectiveMode === 'close') {
    res.status(403).json({
      error: `Toko sedang tutup (${op.scheduleSummary}). ${op.closeDescription}`,
      storeOperationMode: 'close',
    });
    return;
  }
  next();
}

interface AuthedUserRequest extends Request {
  customerUser?: StoredCustomerUser;
}

function requireUser(req: AuthedUserRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const user = findUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Silakan masuk ke akun Anda terlebih dahulu.' });
    return;
  }
  req.customerUser = user;
  next();
}

function saveBase64Image(
  dataUrlOrBase64: string,
  mimeTypeInput: string | undefined,
  prefix: string
): string {
  let mimeType = mimeTypeInput || '';
  let base64Body = dataUrlOrBase64.trim();

  const dataUrlMatch = base64Body.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Body = dataUrlMatch[2];
  }

  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };

  const ext = extMap[mimeType];
  if (!ext) {
    throw new Error('Format gambar harus PNG, JPG, atau WEBP.');
  }

  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0) {
    throw new Error('File gambar kosong atau tidak valid.');
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Ukuran gambar maksimal 5 MB.');
  }

  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/api/uploads/${filename}`;
}

function removeUploadedFileIfLocal(fileUrl: string | null): void {
  if (!fileUrl || !fileUrl.startsWith('/api/uploads/')) return;
  const basename = path.basename(fileUrl);
  if (!/^[a-zA-Z0-9._-]+$/.test(basename)) return;
  const fullPath = path.join(UPLOADS_DIR, basename);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // Ignore cleanup failure
    }
  }
}

function generateOrderId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `NK-${yy}${mm}${dd}-${suffix}`;
}

function statusToIndonesian(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_payment':
      return 'Menunggu Pembayaran';
    case 'pending_verification':
      return 'Menunggu Verifikasi Admin';
    case 'processing':
      return 'Diverifikasi & Diproses';
    case 'completed':
      return 'Selesai';
    case 'rejected':
      return 'Ditolak';
  }
}

function buildAdminWhatsAppMessage(order: NokosOrder, eventLabel: string): string {
  const lines = [
    `*${eventLabel} — ${db.settings.storeName}*`,
    `ID Pesanan: ${order.id}`,
    `Layanan: ${order.appName} (${order.country} ${order.countryCode}) x${order.quantity}`,
    `Total: ${formatRupiah(order.totalAmount)}`,
    `Metode Bayar: ${order.paymentMethod === 'balance' ? 'Saldo Akun (Otomatis Lunas)' : 'QRIS Owner'}`,
    `Pelanggan: ${order.customerName}`,
    `WA Pelanggan: ${order.customerWhatsapp}`,
  ];
  if (order.paymentSenderName) {
    lines.push(`Pengirim QRIS: ${order.paymentSenderName}`);
  }
  if (order.customerNote) {
    lines.push(`Catatan: ${order.customerNote}`);
  }
  lines.push(`Status: ${statusToIndonesian(order.status)}`);
  lines.push(`Waktu: ${formatWibTime(order.updatedAt)} WIB`);
  lines.push('');
  lines.push('Silakan segera proses di Dashboard Owner.');
  return lines.join('\n');
}

function buildTopUpWhatsAppMessage(topup: TopUpRequest): string {
  return [
    `*TOP UP SALDO MASUK — ${db.settings.storeName}*`,
    `ID Top Up: ${topup.id}`,
    `Nominal: ${formatRupiah(topup.amount)}`,
    `Pengguna: ${topup.userName} (WA ${topup.userWhatsapp})`,
    `Pengirim QRIS: ${topup.senderName}`,
    `Waktu: ${formatWibTime(topup.createdAt)} WIB`,
    '',
    'Silakan verifikasi di Dashboard Owner agar saldo otomatis masuk ke akun pengguna.',
  ].join('\n');
}

async function sendWhatsAppNotification(
  message: string,
  event: 'order_created' | 'proof_uploaded' | 'topup_uploaded' | 'manual_test',
  extraPayload?: Record<string, unknown>
): Promise<WhatsAppNotifLog> {
  const settings = db.settings;
  const timestamp = new Date().toISOString();
  const target = normalizeWhatsappNumber(settings.ownerWhatsapp);

  if (settings.whatsappMode === 'direct') {
    return {
      timestamp,
      event,
      mode: 'direct',
      success: true,
      detail: target
        ? `Mode Direct WA aktif untuk ${target} (notif real-time dashboard & tombol wa.me).`
        : 'Nomor WhatsApp admin belum diisi di Pengaturan Owner.',
    };
  }

  if (settings.whatsappMode === 'fonnte') {
    if (!settings.whatsappApiToken || !target) {
      return {
        timestamp,
        event,
        mode: 'fonnte',
        success: false,
        detail: 'Token API Fonnte atau Nomor WA Admin belum diisi.',
      };
    }

    try {
      const formBody = new URLSearchParams({
        target,
        message,
        countryCode: '62',
      });
      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: settings.whatsappApiToken,
        },
        body: formBody,
      });
      const text = await response.text();
      let parsedOk = response.ok;
      let detailMsg = text;
      try {
        const json = JSON.parse(text) as { status?: boolean; reason?: string; detail?: string };
        if (typeof json.status === 'boolean') {
          parsedOk = json.status;
        }
        detailMsg = json.detail || json.reason || text;
      } catch {
        // Keep raw text
      }
      return {
        timestamp,
        event,
        mode: 'fonnte',
        success: parsedOk,
        detail: `Fonnte (${response.status}): ${detailMsg}`,
      };
    } catch (err) {
      return {
        timestamp,
        event,
        mode: 'fonnte',
        success: false,
        detail: `Gagal menghubungi Fonnte: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (!settings.whatsappWebhookUrl) {
    return {
      timestamp,
      event,
      mode: 'webhook',
      success: false,
      detail: 'URL Webhook WhatsApp belum dikonfigurasi.',
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.whatsappApiToken) {
      headers.Authorization = `Bearer ${settings.whatsappApiToken}`;
    }
    const response = await fetch(settings.whatsappWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event,
        target,
        message,
        timestamp,
        ...extraPayload,
      }),
    });
    const text = await response.text();
    return {
      timestamp,
      event,
      mode: 'webhook',
      success: response.ok,
      detail: `Webhook (${response.status}): ${text.slice(0, 200) || (response.ok ? 'Terkirim' : 'Gagal')}`,
    };
  } catch (err) {
    return {
      timestamp,
      event,
      mode: 'webhook',
      success: false,
      detail: `Gagal menghubungi Webhook: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function recordWalletTransaction(
  user: StoredCustomerUser,
  type: WalletTransaction['type'],
  amount: number,
  description: string,
  referenceId: string | null
): WalletTransaction {
  user.balance = Math.max(0, user.balance + amount);
  const tx: WalletTransaction = {
    id: `tx-${crypto.randomBytes(4).toString('hex')}`,
    userId: user.id,
    type,
    amount,
    balanceAfter: user.balance,
    description,
    referenceId,
    createdAt: new Date().toISOString(),
  };
  db.walletTransactions.unshift(tx);
  return tx;
}

function markThreadMessagesRead(
  thread: ChatThread,
  readerRole: 'owner' | 'customer'
): string[] {
  const readAt = new Date().toISOString();
  const updatedIds: string[] = [];
  for (const msg of thread.messages) {
    if (readerRole === 'owner' && msg.senderRole === 'customer' && !msg.readByOwner) {
      msg.readByOwner = true;
      msg.readAt = readAt;
      updatedIds.push(msg.id);
    } else if (
      readerRole === 'customer' &&
      msg.senderRole === 'owner' &&
      !msg.readByCustomer
    ) {
      msg.readByCustomer = true;
      msg.readAt = readAt;
      updatedIds.push(msg.id);
    }
  }
  if (updatedIds.length > 0) {
    saveDatabase(db);
    const readPayload = {
      threadId: thread.id,
      readerRole,
      messageIds: updatedIds,
      readAt,
    };
    broadcastToOwners('chat:read', readPayload);
    broadcastToUser(thread.userId, 'chat:read', readPayload);
  }
  return updatedIds;
}

// ====================================================
// REAL SMS NOKOS PROVIDER ENGINE (NO FAKE/SIMULATED NUMBERS)
// ====================================================
const FIVESIM_DEFAULT_BASE = 'https://5sim.net';
const SMS_ACTIVATE_DEFAULT_BASE = 'https://api.sms-activate.org/stubs/handler_api.php';

function formatRealPhoneNumber(rawPhone: string): string {
  const cleaned = rawPhone.trim().replace(/\s+/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function extractOtpFromSmsText(text: string): string {
  const dashed = text.match(/\b(\d{3}-\d{3})\b/);
  if (dashed) return dashed[1];
  const digits = text.match(/\b(\d{4,8})\b/);
  if (digits) return digits[1];
  return text.trim();
}

function resolveProviderCodes(
  orderOrApp: { appName: string; country: string; countryCode: string },
  service: NokosService | undefined,
  mode: NokosProviderMode
): { product: string; country: string } {
  const rawProduct = (service?.providerProductCode || '').trim().toLowerCase();
  const rawCountry = (service?.providerCountryCode || '').trim().toLowerCase();
  const appLower = orderOrApp.appName.toLowerCase();
  const countryLower = orderOrApp.country.toLowerCase();
  const codeLower = orderOrApp.countryCode.toLowerCase();

  if (mode === 'fivesim') {
    let product = rawProduct;
    if (!product) {
      if (appLower.includes('whatsapp')) product = 'whatsapp';
      else if (appLower.includes('telegram')) product = 'telegram';
      else if (appLower.includes('shopee')) product = 'shopee';
      else if (appLower.includes('tiktok')) product = 'tiktok';
      else if (appLower.includes('google') || appLower.includes('gmail')) product = 'google';
      else if (appLower.includes('instagram')) product = 'instagram';
      else if (appLower.includes('facebook')) product = 'facebook';
      else product = appLower.replace(/[^a-z0-9]/g, '');
    } else {
      const shortToFiveSim: Record<string, string> = {
        wa: 'whatsapp',
        tg: 'telegram',
        ka: 'shopee',
        lf: 'tiktok',
        go: 'google',
        ig: 'instagram',
        fb: 'facebook',
      };
      product = shortToFiveSim[product] || product;
    }

    let country = rawCountry;
    if (!country) {
      if (countryLower.includes('indonesia') || codeLower === '+62') country = 'indonesia';
      else if (countryLower.includes('malaysia') || codeLower === '+60') country = 'malaysia';
      else if (
        countryLower.includes('amerika') ||
        countryLower.includes('usa') ||
        codeLower === '+1'
      ) {
        country = 'usa';
      } else {
        country = countryLower.replace(/[^a-z0-9]/g, '');
      }
    } else {
      const idToFiveSim: Record<string, string> = {
        '6': 'indonesia',
        '7': 'malaysia',
        '187': 'usa',
        '12': 'usa',
      };
      country = idToFiveSim[country] || country;
    }

    return { product, country };
  }

  // sms_activate / compatible handler_api.php providers
  let product = rawProduct;
  const fiveSimToSmsActivate: Record<string, string> = {
    whatsapp: 'wa',
    telegram: 'tg',
    shopee: 'ka',
    tiktok: 'lf',
    google: 'go',
    gmail: 'go',
    instagram: 'ig',
    facebook: 'fb',
    discord: 'ds',
    line: 'me',
  };
  if (product) {
    product = fiveSimToSmsActivate[product] || product;
  } else {
    if (appLower.includes('whatsapp')) product = 'wa';
    else if (appLower.includes('telegram')) product = 'tg';
    else if (appLower.includes('shopee')) product = 'ka';
    else if (appLower.includes('tiktok')) product = 'lf';
    else if (appLower.includes('google') || appLower.includes('gmail')) product = 'go';
    else if (appLower.includes('instagram')) product = 'ig';
    else if (appLower.includes('facebook')) product = 'fb';
    else product = appLower.slice(0, 2);
  }

  let country = rawCountry;
  const nameToSmsActivateCountry: Record<string, string> = {
    indonesia: '6',
    malaysia: '7',
    usa: '187',
    unitedstates: '187',
    singapore: '196',
    vietnam: '10',
    thailand: '52',
    philippines: '4',
  };
  if (country) {
    country = nameToSmsActivateCountry[country] || country;
  } else {
    if (countryLower.includes('indonesia') || codeLower === '+62') country = '6';
    else if (countryLower.includes('malaysia') || codeLower === '+60') country = '7';
    else if (
      countryLower.includes('amerika') ||
      countryLower.includes('usa') ||
      codeLower === '+1'
    ) {
      country = '187';
    } else {
      country = '6';
    }
  }

  return { product, country };
}

function getProviderBaseUrl(settings: OwnerSettings): string {
  const custom = (settings.nokosBaseUrl || '').trim().replace(/\/+$/, '');
  if (settings.nokosProviderMode === 'fivesim') {
    return custom || FIVESIM_DEFAULT_BASE;
  }
  return custom || SMS_ACTIVATE_DEFAULT_BASE;
}

async function testProviderConnection(settings: OwnerSettings): Promise<{
  ok: boolean;
  mode: NokosProviderMode;
  balance?: string;
  detail: string;
}> {
  if (settings.nokosProviderMode === 'manual') {
    return {
      ok: true,
      mode: 'manual',
      detail:
        'Mode Manual SIM / Supplier aktif. Nomor asli dan kode OTP diinput langsung oleh Owner tanpa simulasi.',
    };
  }

  const apiKey = (settings.nokosApiKey || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      mode: settings.nokosProviderMode,
      detail: 'API Key provider belum diisi.',
    };
  }

  const baseUrl = getProviderBaseUrl(settings);

  try {
    if (settings.nokosProviderMode === 'fivesim') {
      const resp = await fetch(`${baseUrl}/v1/user/profile`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      const text = await resp.text();
      if (!resp.ok) {
        return {
          ok: false,
          mode: 'fivesim',
          detail: `5sim (${resp.status}): ${text.slice(0, 200)}`,
        };
      }
      const json = JSON.parse(text) as { email?: string; balance?: number };
      const bal = json.balance !== undefined ? String(json.balance) : '0';
      return {
        ok: true,
        mode: 'fivesim',
        balance: bal,
        detail: `Terhubung ke 5sim (${json.email || 'Akun Aktif'}). Saldo Provider: ${bal}`,
      };
    }

    // sms_activate / handler_api.php
    const sep = baseUrl.includes('?') ? '&' : '?';
    const resp = await fetch(
      `${baseUrl}${sep}api_key=${encodeURIComponent(apiKey)}&action=getBalance`
    );
    const text = (await resp.text()).trim();
    if (text.startsWith('ACCESS_BALANCE:')) {
      const bal = text.slice('ACCESS_BALANCE:'.length).trim();
      return {
        ok: true,
        mode: 'sms_activate',
        balance: bal,
        detail: `Terhubung ke Provider API. Saldo Provider: ${bal}`,
      };
    }
    return {
      ok: false,
      mode: 'sms_activate',
      detail: `Respon Provider: ${text.slice(0, 200) || `HTTP ${resp.status}`}`,
    };
  } catch (err) {
    return {
      ok: false,
      mode: settings.nokosProviderMode,
      detail: `Gagal menghubungi provider: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function provisionNumberFromProvider(
  order: NokosOrder,
  service: NokosService | undefined,
  settings: OwnerSettings
): Promise<boolean> {
  if (settings.nokosProviderMode === 'manual') {
    return false;
  }

  const apiKey = (settings.nokosApiKey || '').trim();
  if (!apiKey) {
    order.providerError = 'API Key provider Nokos belum diisi oleh Owner.';
    order.updatedAt = new Date().toISOString();
    return false;
  }

  const baseUrl = getProviderBaseUrl(settings);
  const { product, country } = resolveProviderCodes(
    order,
    service,
    settings.nokosProviderMode
  );
  const now = new Date().toISOString();

  try {
    if (settings.nokosProviderMode === 'fivesim') {
      const url = `${baseUrl}/v1/user/buy/activation/${encodeURIComponent(country)}/any/${encodeURIComponent(product)}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      const text = await resp.text();
      if (!resp.ok) {
        order.providerError = `5sim gagal (${resp.status}): ${text.slice(0, 200)}`;
        order.updatedAt = now;
        return false;
      }

      const json = JSON.parse(text) as { id?: number | string; phone?: string };
      if (!json.id || !json.phone) {
        order.providerError = `Respon 5sim tidak memiliki nomor: ${text.slice(0, 200)}`;
        order.updatedAt = now;
        return false;
      }

      order.providerMode = 'fivesim';
      order.providerActivationId = String(json.id);
      order.assignedNumber = formatRealPhoneNumber(String(json.phone));
      order.providerError = null;
      order.updatedAt = now;
      order.timeline.push({
        status: order.status,
        label: `Nomor real ${order.appName} disiapkan dari provider`,
        timestamp: now,
        actor: 'Sistem',
        note: `Nomor: ${order.assignedNumber} · ID Aktivasi: ${order.providerActivationId}`,
      });
      return true;
    }

    // sms_activate / compatible handler_api.php
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${sep}api_key=${encodeURIComponent(apiKey)}&action=getNumber&service=${encodeURIComponent(product)}&country=${encodeURIComponent(country)}`;
    const resp = await fetch(url);
    const text = (await resp.text()).trim();

    if (text.startsWith('ACCESS_NUMBER:')) {
      const parts = text.split(':');
      const activationId = parts[1]?.trim();
      const phone = parts.slice(2).join(':').trim();
      if (!activationId || !phone) {
        order.providerError = `Format respon provider tidak lengkap: ${text}`;
        order.updatedAt = now;
        return false;
      }

      order.providerMode = 'sms_activate';
      order.providerActivationId = activationId;
      order.assignedNumber = formatRealPhoneNumber(phone);
      order.providerError = null;
      order.updatedAt = now;
      order.timeline.push({
        status: order.status,
        label: `Nomor real ${order.appName} disiapkan dari provider`,
        timestamp: now,
        actor: 'Sistem',
        note: `Nomor: ${order.assignedNumber} · ID Aktivasi: ${activationId}`,
      });
      return true;
    }

    order.providerError = `Provider error: ${text || `HTTP ${resp.status}`}`;
    order.updatedAt = now;
    return false;
  } catch (err) {
    order.providerError = `Gagal menghubungi provider: ${err instanceof Error ? err.message : String(err)}`;
    order.updatedAt = now;
    return false;
  }
}

async function checkProviderOrderSms(
  order: NokosOrder,
  settings: OwnerSettings
): Promise<{ updated: boolean; message: string }> {
  if (
    order.providerMode === 'manual' ||
    !order.providerActivationId ||
    !settings.nokosApiKey.trim()
  ) {
    return {
      updated: false,
      message: 'Pesanan ini ditangani manual oleh admin atau belum memiliki ID aktivasi API.',
    };
  }

  const apiKey = settings.nokosApiKey.trim();
  const baseUrl = getProviderBaseUrl(settings);
  const now = new Date().toISOString();

  try {
    if (order.providerMode === 'fivesim') {
      const resp = await fetch(
        `${baseUrl}/v1/user/check/${encodeURIComponent(order.providerActivationId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        }
      );
      const text = await resp.text();
      if (!resp.ok) {
        return { updated: false, message: `5sim (${resp.status}): ${text.slice(0, 160)}` };
      }

      const json = JSON.parse(text) as {
        status?: string;
        sms?: Array<{ code?: string; text?: string; sender?: string }>;
      };

      const smsList = Array.isArray(json.sms) ? json.sms : [];
      const latestSms = smsList[smsList.length - 1];
      if (latestSms && (latestSms.code || latestSms.text)) {
        const extractedCode =
          (latestSms.code || '').trim() || extractOtpFromSmsText(latestSms.text || '');
        if (extractedCode && extractedCode !== order.otpCode) {
          order.otpCode = extractedCode;
          order.otpSmsText = latestSms.text || latestSms.code || null;
          order.providerError = null;
          order.status = 'completed';
          order.completedAt = order.completedAt || now;
          order.updatedAt = now;
          order.timeline.push({
            status: 'completed',
            label: `Kode OTP SMS asli diterima untuk ${order.appName}`,
            timestamp: now,
            actor: 'Sistem',
            note: `OTP: ${extractedCode}`,
          });
          return { updated: true, message: `OTP diterima: ${extractedCode}` };
        }
      }

      if (
        json.status === 'CANCELED' ||
        json.status === 'BANNED' ||
        json.status === 'TIMEOUT'
      ) {
        const errMsg = `Aktivasi provider berakhir (${json.status}).`;
        if (order.providerError !== errMsg) {
          order.providerError = errMsg;
          order.updatedAt = now;
          return { updated: true, message: errMsg };
        }
        return { updated: false, message: errMsg };
      }

      return { updated: false, message: 'Menunggu SMS OTP masuk dari aplikasi...' };
    }

    // sms_activate / compatible handler_api.php
    const sep = baseUrl.includes('?') ? '&' : '?';
    const resp = await fetch(
      `${baseUrl}${sep}api_key=${encodeURIComponent(apiKey)}&action=getStatus&id=${encodeURIComponent(order.providerActivationId)}`
    );
    const text = (await resp.text()).trim();

    if (text.startsWith('STATUS_OK:')) {
      const rawPayload = text.slice('STATUS_OK:'.length).trim();
      const extractedCode = extractOtpFromSmsText(rawPayload) || rawPayload;
      if (extractedCode && extractedCode !== order.otpCode) {
        order.otpCode = extractedCode;
        order.otpSmsText = rawPayload;
        order.providerError = null;
        order.status = 'completed';
        order.completedAt = order.completedAt || now;
        order.updatedAt = now;
        order.timeline.push({
          status: 'completed',
          label: `Kode OTP SMS asli diterima untuk ${order.appName}`,
          timestamp: now,
          actor: 'Sistem',
          note: `OTP: ${extractedCode}`,
        });
        return { updated: true, message: `OTP diterima: ${extractedCode}` };
      }
      return { updated: false, message: `OTP sudah diterima: ${order.otpCode}` };
    }

    if (text === 'STATUS_CANCEL') {
      const errMsg = 'Aktivasi dibatalkan oleh provider (STATUS_CANCEL).';
      if (order.providerError !== errMsg) {
        order.providerError = errMsg;
        order.updatedAt = now;
        return { updated: true, message: errMsg };
      }
      return { updated: false, message: errMsg };
    }

    return {
      updated: false,
      message:
        text === 'STATUS_WAIT_CODE' || text === 'STATUS_WAIT_RESEND'
          ? 'Menunggu SMS OTP masuk dari aplikasi...'
          : `Status provider: ${text}`,
    };
  } catch (err) {
    return {
      updated: false,
      message: `Gagal cek SMS: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function sendProviderStatusAction(
  order: NokosOrder,
  settings: OwnerSettings,
  action: 'retry_sms' | 'complete' | 'cancel'
): Promise<{ ok: boolean; detail: string }> {
  if (
    order.providerMode === 'manual' ||
    !order.providerActivationId ||
    !settings.nokosApiKey.trim()
  ) {
    return { ok: false, detail: 'Tidak ada aktivasi provider API aktif pada pesanan ini.' };
  }

  const apiKey = settings.nokosApiKey.trim();
  const baseUrl = getProviderBaseUrl(settings);

  try {
    if (order.providerMode === 'fivesim') {
      if (action === 'retry_sms') {
        return {
          ok: true,
          detail: '5sim menerima SMS baru otomatis selama masa aktivasi masih aktif.',
        };
      }
      const endpoint = action === 'complete' ? 'finish' : 'cancel';
      const resp = await fetch(
        `${baseUrl}/v1/user/${endpoint}/${encodeURIComponent(order.providerActivationId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        }
      );
      const text = await resp.text();
      return { ok: resp.ok, detail: text.slice(0, 200) };
    }

    const statusCode = action === 'retry_sms' ? '3' : action === 'complete' ? '6' : '8';
    const sep = baseUrl.includes('?') ? '&' : '?';
    const resp = await fetch(
      `${baseUrl}${sep}api_key=${encodeURIComponent(apiKey)}&action=setStatus&status=${statusCode}&id=${encodeURIComponent(order.providerActivationId)}`
    );
    const text = (await resp.text()).trim();
    return {
      ok: resp.ok && !text.startsWith('BAD_') && !text.startsWith('ERROR_'),
      detail: text,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Safe uploaded image serving
  app.get('/api/uploads/:filename', (req, res) => {
    const filename = path.basename(req.params.filename || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).json({ error: 'Nama file tidak valid.' });
      return;
    }
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File tidak ditemukan.' });
      return;
    }
    res.sendFile(filePath);
  });

  // Public bootstrap
  app.get('/api/public/store', (_req, res) => {
    const rentalLock = getPublicRentalLockState();
    const operation = computeStoreOperationState();
    res.json({
      settings: getPublicSettings(db.settings),
      services: db.services.filter((s) => s.active),
      broadcasts: db.broadcasts
        .filter((b) => b.active)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ownerInitialized: db.ownerAuth.initialized,
      rentalLock,
      operation,
    });
  });

  // ==========================
  // CUSTOMER AUTH & WALLET API
  // ==========================
  app.post('/api/auth/register', requireWebUnlocked, (req, res) => {
    const { name, email, whatsapp, password, confirmPassword } = req.body as {
      name?: string;
      email?: string;
      whatsapp?: string;
      password?: string;
      confirmPassword?: string;
    };

    const cleanName = (name || '').trim().slice(0, 80);
    const cleanEmail = (email || '').trim().toLowerCase().slice(0, 120);
    const cleanWa = normalizeWhatsappNumber(whatsapp || '');

    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Nama atau username minimal 2 karakter.' });
      return;
    }
    if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
      res.status(400).json({ error: 'Masukkan alamat Gmail / email yang valid.' });
      return;
    }
    if (cleanWa.length < 9 || cleanWa.length > 16) {
      res.status(400).json({ error: 'Masukkan nomor aktif yang valid.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    if (typeof confirmPassword === 'string' && confirmPassword !== password) {
      res.status(400).json({ error: 'Ulangi sandi Anda tidak cocok.' });
      return;
    }

    if (constantTimeEmailMatch(cleanEmail, db.ownerAuth.ownerEmail)) {
      appendSecurityLog(
        'warning',
        'OWNER_REGISTER_PROBE',
        'Percobaan mendaftar ulang menggunakan Gmail resmi Owner melalui form pelanggan ditolak.',
        getClientIp(req),
        getClientUserAgent(req),
        true
      );
      res.status(403).json({
        error: 'Gmail ini sudah terdaftar sebagai akun Owner Utama. Silakan gunakan menu Masuk.',
      });
      return;
    }

    if (db.users.some((u) => u.email === cleanEmail)) {
      res.status(409).json({ error: 'Gmail / email sudah terdaftar. Silakan masuk.' });
      return;
    }
    if (db.users.some((u) => !isReservedOwnerUser(u) && u.whatsapp === cleanWa)) {
      res.status(409).json({ error: 'Nomor aktif sudah terdaftar. Silakan masuk.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const user: StoredCustomerUser = {
      id: `usr-${crypto.randomBytes(4).toString('hex')}`,
      name: cleanName,
      email: cleanEmail,
      whatsapp: cleanWa,
      balance: 0,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };

    const token = crypto.randomBytes(32).toString('hex');
    db.users.unshift(user);
    db.userSessions.push({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    saveDatabase(db);
    broadcastToOwners('user:registered', toPublicUser(user));

    res.status(201).json({ token, user: toPublicUser(user) });
  });

  app.post('/api/auth/login', requireWebUnlocked, (req, res) => {
    const { identifier, password } = req.body as {
      identifier?: string;
      password?: string;
    };
    const rawId = (identifier || '').trim().toLowerCase();
    const waId = normalizeWhatsappNumber(identifier || '');

    if (!rawId || !password) {
      res.status(400).json({
        error: 'Masukkan Gmail, username, atau nomor aktif dan kata sandi.',
      });
      return;
    }

    // Check if the user is logging in as Primary Owner via normal Login modal
    if (
      db.ownerAuth.initialized &&
      db.ownerAuth.salt &&
      db.ownerAuth.passwordHash &&
      constantTimeEmailMatch(rawId, db.ownerAuth.ownerEmail)
    ) {
      const ip = getClientIp(req);
      const ua = getClientUserAgent(req);
      const ownerIpKey = `owner:${ip}`;
      const ownerGlobalKey = 'owner:global';
      const ipLock = checkAuthLockout(ownerIpKey);
      const globalLock = checkAuthLockout(ownerGlobalKey);

      if (ipLock.locked || globalLock.locked) {
        const rem = Math.max(ipLock.remainingSeconds, globalLock.remainingSeconds);
        appendSecurityLog(
          'critical',
          'OWNER_LOGIN_LOCKED',
          `Percobaan login Owner dari form Masuk ditolak karena IP dikunci (sisa ${rem} detik).`,
          ip,
          ua,
          true
        );
        res.status(429).json({
          error: `Akses akun dikunci sementara demi keamanan. Coba lagi dalam ${rem} detik.`,
          lockedRemainingSeconds: rem,
        });
        return;
      }

      const passwordOk = verifyPassword(
        password,
        db.ownerAuth.salt,
        db.ownerAuth.passwordHash
      );

      if (!passwordOk) {
        const failIp = recordAuthFailure(ownerIpKey, [
          { count: 3, lockSeconds: 120 },
          { count: 5, lockSeconds: 900 },
          { count: 8, lockSeconds: 3600 },
        ]);
        recordAuthFailure(ownerGlobalKey, [{ count: 15, lockSeconds: 300 }]);
        const masked = maskEmailForLog(rawId);
        appendSecurityLog(
          failIp.count >= 3 ? 'critical' : 'warning',
          'OWNER_LOGIN_FAILED',
          `Percobaan masuk Owner via form Masuk gagal ke-${failIp.count} (${masked}).`,
          ip,
          ua,
          failIp.count >= 2
        );

        if (failIp.count >= 3 && db.settings.ownerWhatsapp) {
          const secMsg = [
            `*PERINGATAN KEAMANAN — ${db.settings.storeName}*`,
            `Terdeteksi ${failIp.count}x percobaan gagal masuk akun Owner.`,
            `Email: ${masked}`,
            `IP: ${ip}`,
            `Waktu: ${formatWibTime(new Date().toISOString())} WIB`,
          ].join('\n');
          void sendWhatsAppNotification(secMsg, 'manual_test', {
            securityAlert: true,
            ip,
          });
        }

        if (failIp.lockedSeconds > 0) {
          res.status(429).json({
            error: `Terlalu banyak percobaan gagal. Akses dikunci ${failIp.lockedSeconds} detik.`,
            lockedRemainingSeconds: failIp.lockedSeconds,
          });
          return;
        }
        res.status(401).json({
          error: 'Gmail, username, nomor aktif, atau kata sandi salah.',
        });
        return;
      }

      clearAuthFailures(ownerIpKey);
      clearAuthFailures(ownerGlobalKey);

      const ownerCustomer = ensureOwnerCustomerRecord();
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const customerToken = crypto.randomBytes(32).toString('hex');
      db.userSessions = db.userSessions.filter((s) => s.expiresAt > nowMs);
      db.userSessions.push({
        token: customerToken,
        userId: ownerCustomer.id,
        createdAt: nowIso,
        expiresAt: nowMs + 7 * 24 * 60 * 60 * 1000,
      });

      const ownerToken = crypto.randomBytes(32).toString('hex');
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.expiresAt > nowMs);
      db.ownerAuth.sessions.push({
        id: `ses-${crypto.randomBytes(4).toString('hex')}`,
        token: ownerToken,
        role: 'owner',
        ip,
        userAgent: ua,
        uaHash: hashUserAgent(ua),
        createdAt: nowIso,
        lastSeenAt: nowIso,
        expiresAt: nowMs + 24 * 60 * 60 * 1000,
      });

      appendSecurityLog(
        'info',
        'OWNER_LOGIN_SUCCESS',
        'Owner Utama berhasil masuk melalui form Masuk (akses Owner & Pelanggan aktif).',
        ip,
        ua,
        false
      );

      res.json({
        token: customerToken,
        user: toPublicUser(ownerCustomer),
        ownerToken,
        ownerRole: 'owner',
      });
      return;
    }

    const ip = getClientIp(req);
    const custKey = `cust:${ip}`;
    const custLock = checkAuthLockout(custKey);
    if (custLock.locked) {
      res.status(429).json({
        error: `Terlalu banyak percobaan masuk gagal. Coba lagi dalam ${custLock.remainingSeconds} detik.`,
        lockedRemainingSeconds: custLock.remainingSeconds,
      });
      return;
    }

    const user = db.users.find(
      (u) =>
        !isReservedOwnerUser(u) &&
        (u.email === rawId ||
          u.name.toLowerCase() === rawId ||
          (waId.length >= 9 && u.whatsapp === waId)) &&
        verifyPassword(password, u.salt, u.passwordHash)
    );
    if (!user) {
      const fail = recordAuthFailure(custKey, [{ count: 8, lockSeconds: 60 }]);
      if (fail.lockedSeconds > 0) {
        res.status(429).json({
          error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${fail.lockedSeconds} detik.`,
          lockedRemainingSeconds: fail.lockedSeconds,
        });
        return;
      }
      res.status(401).json({
        error: 'Gmail, username, nomor aktif, atau kata sandi salah.',
      });
      return;
    }

    clearAuthFailures(custKey);
    const token = crypto.randomBytes(32).toString('hex');
    const nowMs = Date.now();
    db.userSessions = db.userSessions.filter((s) => s.expiresAt > nowMs);
    db.userSessions.push({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: nowMs + 30 * 24 * 60 * 60 * 1000,
    });
    saveDatabase(db);

    res.json({ token, user: toPublicUser(user) });
  });

  app.get('/api/auth/me', requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const userTopups = db.topups.filter((t) => t.userId === user.id);
    const userTxs = db.walletTransactions.filter((t) => t.userId === user.id);
    const userOrders = db.orders.filter(
      (o) => o.userId === user.id || o.customerWhatsapp === user.whatsapp
    );
    res.json({
      user: toPublicUser(user),
      topups: userTopups,
      walletTransactions: userTxs,
      orders: userOrders,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      db.userSessions = db.userSessions.filter((s) => s.token !== token);
      saveDatabase(db);
    }
    res.json({ ok: true });
  });

  // Customer forgot password & username recovery (verifies both Gmail and active phone number)
  app.post('/api/auth/recover', (req, res) => {
    const { email, whatsapp, newPassword, confirmPassword } = req.body as {
      email?: string;
      whatsapp?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanWa = normalizeWhatsappNumber(whatsapp || '');

    if (cleanEmail && constantTimeEmailMatch(cleanEmail, db.ownerAuth.ownerEmail)) {
      appendSecurityLog(
        'warning',
        'OWNER_RECOVERY_PROBE',
        'Percobaan reset sandi akun Owner Utama lewat form Lupa Sandi pelanggan diblokir.',
        getClientIp(req),
        getClientUserAgent(req),
        true
      );
      res.status(403).json({
        error:
          'Akun Owner Utama tidak dapat direset lewat pemulihan pelanggan demi keamanan.',
      });
      return;
    }

    if (!cleanEmail || cleanWa.length < 9) {
      res.status(400).json({
        error: 'Masukkan Gmail dan nomor aktif yang terdaftar untuk verifikasi akun.',
      });
      return;
    }

    const user = db.users.find(
      (u) => !isReservedOwnerUser(u) && u.email === cleanEmail && u.whatsapp === cleanWa
    );
    if (!user) {
      res.status(404).json({
        error: 'Data Gmail dan nomor aktif tidak cocok atau belum terdaftar.',
      });
      return;
    }

    if (!newPassword) {
      res.json({
        ok: true,
        username: user.name,
        email: user.email,
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'Ulangi sandi baru Anda tidak cocok.' });
      return;
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.salt = newSalt;
    user.passwordHash = hashPassword(newPassword, newSalt);

    const token = crypto.randomBytes(32).toString('hex');
    const nowMs = Date.now();
    db.userSessions = db.userSessions.filter((s) => s.expiresAt > nowMs);
    db.userSessions.push({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: nowMs + 30 * 24 * 60 * 60 * 1000,
    });

    saveDatabase(db);
    broadcastToOwners('user:updated', toPublicUser(user));
    res.json({
      ok: true,
      username: user.name,
      token,
      user: toPublicUser(user),
    });
  });

  // Logged-in customer change password
  app.post('/api/auth/change-password', requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const { currentPassword, newPassword, confirmPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (!currentPassword || !verifyPassword(currentPassword, user.salt, user.passwordHash)) {
      res.status(401).json({ error: 'Kata sandi saat ini salah.' });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'Ulangi sandi baru Anda tidak cocok.' });
      return;
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.salt = newSalt;
    user.passwordHash = hashPassword(newPassword, newSalt);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Logged-in customer update username / active phone
  app.patch('/api/auth/profile', requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const { name, whatsapp } = req.body as { name?: string; whatsapp?: string };

    if (typeof name === 'string') {
      const cleanName = name.trim().slice(0, 80);
      if (cleanName.length < 2) {
        res.status(400).json({ error: 'Nama atau username minimal 2 karakter.' });
        return;
      }
      user.name = cleanName;
    }

    if (typeof whatsapp === 'string') {
      const cleanWa = normalizeWhatsappNumber(whatsapp);
      if (cleanWa.length < 9 || cleanWa.length > 16) {
        res.status(400).json({ error: 'Masukkan nomor aktif yang valid.' });
        return;
      }
      if (db.users.some((u) => u.id !== user.id && u.whatsapp === cleanWa)) {
        res.status(409).json({ error: 'Nomor aktif tersebut sudah digunakan akun lain.' });
        return;
      }
      user.whatsapp = cleanWa;
    }

    saveDatabase(db);
    broadcastToOwners('user:updated', toPublicUser(user));
    res.json({ user: toPublicUser(user) });
  });

  // Top Up Saldo via Owner QRIS
  app.post('/api/wallet/topups', requireWebUnlocked, requireStoreOpenForOrder, requireUser, async (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    if (!db.settings.qrisImageUrl) {
      res.status(400).json({
        error: 'QRIS resmi belum diunggah oleh owner. Silakan hubungi owner terlebih dahulu.',
      });
      return;
    }

    const { amount, senderName, dataBase64, mimeType } = req.body as {
      amount?: number;
      senderName?: string;
      dataBase64?: string;
      mimeType?: string;
    };

    const numAmount = Math.round(Number(amount));
    if (!Number.isFinite(numAmount) || numAmount < 5000 || numAmount > 10000000) {
      res.status(400).json({ error: 'Nominal isi saldo antara Rp 5.000 sampai Rp 10.000.000.' });
      return;
    }

    const cleanSender = (senderName || '').trim().slice(0, 80);
    if (cleanSender.length < 2) {
      res.status(400).json({ error: 'Masukkan nama pengirim / bank / e-wallet.' });
      return;
    }

    if (!dataBase64) {
      res.status(400).json({ error: 'Unggah foto bukti pembayaran QRIS Anda.' });
      return;
    }

    let proofUrl: string;
    try {
      proofUrl = saveBase64Image(dataBase64, mimeType, `topup-${user.id}`);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan bukti.' });
      return;
    }

    const now = new Date().toISOString();
    const topup: TopUpRequest = {
      id: `TOP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      userId: user.id,
      userName: user.name,
      userWhatsapp: user.whatsapp,
      amount: numAmount,
      senderName: cleanSender,
      proofUrl,
      status: 'pending_verification',
      adminNote: null,
      whatsappNotifLog: [],
      createdAt: now,
      reviewedAt: null,
    };

    const msg = buildTopUpWhatsAppMessage(topup);
    const notifLog = await sendWhatsAppNotification(msg, 'topup_uploaded', {
      topupId: topup.id,
      amount: topup.amount,
    });
    topup.whatsappNotifLog.push(notifLog);

    db.topups.unshift(topup);
    saveDatabase(db);
    broadcastToOwners('topup:update', topup);
    broadcastToUser(user.id, 'topup:update', topup);

    res.status(201).json({ topup });
  });

  // ==========================
  // ORDERS API
  // ==========================
  app.post('/api/orders', requireWebUnlocked, requireStoreOpenForOrder, async (req, res) => {
    const authUser = findUserByToken(extractBearerToken(req));
    const {
      serviceId,
      quantity,
      paymentMethod,
      customerName,
      customerWhatsapp,
      customerNote,
    } = req.body as {
      serviceId?: string;
      quantity?: number;
      paymentMethod?: OrderPaymentMethod;
      customerName?: string;
      customerWhatsapp?: string;
      customerNote?: string;
    };

    const service = db.services.find((s) => s.id === serviceId && s.active);
    if (!service) {
      res.status(404).json({ error: 'Layanan Nokos tidak ditemukan atau sedang nonaktif.' });
      return;
    }

    const qty = Number(quantity ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      res.status(400).json({ error: 'Jumlah pesanan harus antara 1 sampai 10.' });
      return;
    }

    if (service.stock < qty) {
      res.status(400).json({
        error: `Stok saat ini tersisa ${service.stock}. Kurangi jumlah pesanan atau pilih layanan lain.`,
      });
      return;
    }

    const method: OrderPaymentMethod = paymentMethod === 'balance' ? 'balance' : 'qris';
    const totalAmount = service.price * qty;

    if (method === 'balance') {
      if (!authUser) {
        res.status(401).json({ error: 'Masuk ke akun Anda untuk membayar menggunakan Saldo.' });
        return;
      }
      if (authUser.balance < totalAmount) {
        res.status(400).json({
          error: `Saldo Anda (${formatRupiah(authUser.balance)}) tidak mencukupi untuk total ${formatRupiah(totalAmount)}. Silakan isi saldo via QRIS Owner.`,
        });
        return;
      }
    }

    const cleanName = (customerName || authUser?.name || '').trim().slice(0, 80);
    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Nama pelanggan minimal 2 karakter.' });
      return;
    }

    const normalizedWa = normalizeWhatsappNumber(customerWhatsapp || authUser?.whatsapp || '');
    if (normalizedWa.length < 9 || normalizedWa.length > 16) {
      res.status(400).json({
        error: 'Masukkan nomor aktif yang valid.',
      });
      return;
    }

    const now = new Date().toISOString();
    const orderId = generateOrderId();

    const isPaidWithBalance = method === 'balance' && authUser !== null;
    if (isPaidWithBalance && authUser) {
      service.stock = Math.max(0, service.stock - qty);
      service.updatedAt = now;
    }

    const order: NokosOrder = {
      id: orderId,
      userId: authUser?.id ?? null,
      serviceId: service.id,
      appName: service.appName,
      country: service.country,
      countryCode: service.countryCode,
      quantity: qty,
      unitPrice: service.price,
      totalAmount,
      paymentMethod: method,
      customerName: cleanName,
      customerWhatsapp: normalizedWa,
      customerNote: (customerNote || '').trim().slice(0, 240),
      status: isPaidWithBalance ? 'processing' : 'awaiting_payment',
      paymentProofUrl: null,
      paymentSenderName: isPaidWithBalance ? 'Saldo Akun' : null,
      assignedNumber: null,
      otpCode: null,
      otpSmsText: null,
      providerActivationId: null,
      providerMode: db.settings.nokosProviderMode,
      providerError: null,
      adminNote: null,
      whatsappNotifLog: [],
      timeline: isPaidWithBalance
        ? [
            {
              status: 'processing',
              label: 'Pesanan dibuat & dibayar otomatis menggunakan Saldo Akun',
              timestamp: now,
              actor: 'Pelanggan',
              note: `Terpotong ${formatRupiah(totalAmount)}`,
            },
          ]
        : [
            {
              status: 'awaiting_payment',
              label: 'Pesanan dibuat, menunggu pembayaran QRIS Owner',
              timestamp: now,
              actor: 'Pelanggan',
            },
          ],
      createdAt: now,
      paidAt: isPaidWithBalance ? now : null,
      verifiedAt: isPaidWithBalance ? now : null,
      completedAt: null,
      updatedAt: now,
    };

    if (isPaidWithBalance && db.settings.nokosProviderMode !== 'manual') {
      await provisionNumberFromProvider(order, service, db.settings);
    }

    let walletTx: WalletTransaction | null = null;
    if (isPaidWithBalance && authUser) {
      walletTx = recordWalletTransaction(
        authUser,
        'order_payment',
        -totalAmount,
        `Pembayaran order ${orderId} (${service.appName} ${service.country})`,
        orderId
      );
    }

    // Real-time WhatsApp Notification for EVERY new order!
    if (db.settings.notifyOnNewOrder || isPaidWithBalance) {
      const label = isPaidWithBalance
        ? 'PESANAN BARU LUNAS (SALDO) — SEGERA PROSES'
        : 'PESANAN BARU MASUK';
      const msg = buildAdminWhatsAppMessage(order, label);
      const notifLog = await sendWhatsAppNotification(msg, 'order_created', {
        orderId: order.id,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
      });
      order.whatsappNotifLog.push(notifLog);
    }

    db.orders.unshift(order);
    saveDatabase(db);
    broadcastOrderUpdate(order);
    if (walletTx && authUser) {
      broadcastToUser(authUser.id, 'wallet:update', {
        balance: authUser.balance,
        transaction: walletTx,
      });
    }

    res.status(201).json({
      order,
      updatedBalance: authUser ? authUser.balance : undefined,
      walletTransaction: walletTx ?? undefined,
    });
  });

  // Upload payment proof for an order
  app.post('/api/orders/:id/proof', async (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    if (order.status === 'completed') {
      res.status(400).json({ error: 'Pesanan ini sudah selesai.' });
      return;
    }

    if (!db.settings.qrisImageUrl) {
      res.status(400).json({
        error: 'QRIS pembayaran belum diatur oleh owner. Hubungi admin terlebih dahulu.',
      });
      return;
    }

    const { dataBase64, mimeType, paymentSenderName } = req.body as {
      dataBase64?: string;
      mimeType?: string;
      paymentSenderName?: string;
    };

    if (!dataBase64) {
      res.status(400).json({ error: 'Harap pilih file gambar bukti pembayaran.' });
      return;
    }

    const cleanSender = (paymentSenderName || '').trim().slice(0, 80);
    if (cleanSender.length < 2) {
      res.status(400).json({ error: 'Masukkan nama pengirim / rekening / e-wallet Anda.' });
      return;
    }

    let proofUrl: string;
    try {
      proofUrl = saveBase64Image(dataBase64, mimeType, `proof-${order.id}`);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan bukti.' });
      return;
    }

    if (order.paymentProofUrl) {
      removeUploadedFileIfLocal(order.paymentProofUrl);
    }

    const now = new Date().toISOString();
    order.paymentProofUrl = proofUrl;
    order.paymentSenderName = cleanSender;
    order.status = 'pending_verification';
    order.paidAt = now;
    order.adminNote = null;
    order.updatedAt = now;
    order.timeline.push({
      status: 'pending_verification',
      label: 'Bukti pembayaran QRIS dikirim, menunggu verifikasi manual admin',
      timestamp: now,
      actor: 'Pelanggan',
      note: `Pengirim: ${cleanSender}`,
    });

    if (db.settings.notifyOnPaymentProof) {
      const msg = buildAdminWhatsAppMessage(order, 'BUKTI BAYAR MASUK — PERLU VERIFIKASI');
      const notifLog = await sendWhatsAppNotification(msg, 'proof_uploaded', {
        orderId: order.id,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentSenderName: cleanSender,
      });
      order.whatsappNotifLog.push(notifLog);
    }

    saveDatabase(db);
    broadcastOrderUpdate(order);

    res.json({ order });
  });

  // Track orders by IDs, logged-in user, or search query
  app.get('/api/orders/track', (req, res) => {
    const authUser = findUserByToken(extractBearerToken(req));
    const idsParam = typeof req.query.ids === 'string' ? req.query.ids : '';
    const qParam = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const idSet = new Set(
      idsParam
        .split(',')
        .map((id) => id.trim().toUpperCase())
        .filter(Boolean)
    );

    const matched: NokosOrder[] = [];
    const seen = new Set<string>();

    const normalizedQueryWa = qParam ? normalizeWhatsappNumber(qParam) : '';
    const upperQuery = qParam.toUpperCase();

    for (const order of db.orders) {
      let include = false;
      if (authUser && (order.userId === authUser.id || order.customerWhatsapp === authUser.whatsapp)) {
        include = true;
      }
      if (idSet.has(order.id.toUpperCase())) {
        include = true;
      }
      if (qParam) {
        if (order.id.toUpperCase() === upperQuery) {
          include = true;
        } else if (normalizedQueryWa.length >= 6 && order.customerWhatsapp === normalizedQueryWa) {
          include = true;
        }
      }
      if (include && !seen.has(order.id)) {
        seen.add(order.id);
        matched.push(order);
      }
    }

    res.json({ orders: matched });
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = db.orders.find(
      (o) => o.id.toUpperCase() === (req.params.id || '').toUpperCase()
    );
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    res.json({ order });
  });

  // Live check incoming real SMS OTP from connected provider API
  app.post('/api/orders/:id/check-otp', async (req, res) => {
    const order = db.orders.find(
      (o) => o.id.toUpperCase() === (req.params.id || '').toUpperCase()
    );
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    if (order.providerMode === 'manual' || !order.providerActivationId) {
      res.json({
        order,
        updated: false,
        message: order.otpCode
          ? `Kode OTP sudah masuk: ${order.otpCode}`
          : 'Menunggu admin mengirimkan kode OTP SMS masuk secara real-time.',
      });
      return;
    }

    const result = await checkProviderOrderSms(order, db.settings);
    if (result.updated) {
      saveDatabase(db);
      broadcastOrderUpdate(order);
    }
    res.json({ order, updated: result.updated, message: result.message });
  });

  // Request resend SMS OTP from connected provider API
  app.post('/api/orders/:id/request-resend', async (req, res) => {
    const order = db.orders.find(
      (o) => o.id.toUpperCase() === (req.params.id || '').toUpperCase()
    );
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    if (order.providerMode === 'manual' || !order.providerActivationId) {
      res.status(400).json({
        error: 'Pesanan ini menggunakan pengiriman manual oleh admin. Silakan gunakan Live Chat untuk meminta kirim ulang OTP.',
      });
      return;
    }

    const actionRes = await sendProviderStatusAction(order, db.settings, 'retry_sms');
    if (!actionRes.ok) {
      res.status(400).json({ error: `Gagal meminta OTP ulang: ${actionRes.detail}` });
      return;
    }

    const now = new Date().toISOString();
    order.status = 'processing';
    order.otpCode = null;
    order.otpSmsText = null;
    order.updatedAt = now;
    order.timeline.push({
      status: 'processing',
      label: 'Meminta SMS OTP ulang dari provider',
      timestamp: now,
      actor: 'Pelanggan',
    });
    saveDatabase(db);
    broadcastOrderUpdate(order);
    res.json({ order, message: 'Permintaan OTP ulang dikirim. Tunggu SMS masuk.' });
  });

  // ==========================
  // CUSTOMER LIVE CHAT API
  // ==========================
  app.get('/api/chat/threads', requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const threads = db.chatThreads
      .filter((t) => t.userId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ threads });
  });

  app.post('/api/chat/threads', requireWebUnlocked, requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const { orderId, subject, initialMessage } = req.body as {
      orderId?: string | null;
      subject?: string;
      initialMessage?: string;
    };

    const cleanOrderId = orderId ? orderId.trim().toUpperCase().slice(0, 32) : null;
    const cleanText = (initialMessage || '').trim().slice(0, 1000);
    if (!cleanText) {
      res.status(400).json({ error: 'Tulis pesan Anda terlebih dahulu.' });
      return;
    }

    const now = new Date().toISOString();
    const threadId = `CHT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const firstMsg: ChatMessage = {
      id: `msg-${crypto.randomBytes(4).toString('hex')}`,
      threadId,
      senderRole: 'customer',
      senderName: user.name,
      text: cleanText,
      createdAt: now,
      readByOwner: false,
      readByCustomer: true,
      readAt: null,
    };

    const thread: ChatThread = {
      id: threadId,
      userId: user.id,
      userName: user.name,
      userWhatsapp: user.whatsapp,
      orderId: cleanOrderId || null,
      subject:
        (subject || '').trim().slice(0, 100) ||
        (cleanOrderId ? cleanOrderId : threadId),
      status: 'open',
      closedAt: null,
      closedBy: null,
      rating: null,
      review: null,
      ratedAt: null,
      createdAt: now,
      updatedAt: now,
      messages: [firstMsg],
    };

    db.chatThreads.unshift(thread);
    saveDatabase(db);
    broadcastToOwners('chat:thread_created', thread);
    broadcastToUser(user.id, 'chat:thread_created', thread);

    res.status(201).json({ thread });
  });

  app.post('/api/chat/threads/:id/messages', requireWebUnlocked, requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const thread = db.chatThreads.find(
      (t) => t.id === req.params.id && t.userId === user.id
    );
    if (!thread) {
      res.status(404).json({ error: 'Obrolan tidak ditemukan.' });
      return;
    }
    if (thread.status === 'closed') {
      res.status(400).json({
        error: 'Obrolan ini sudah ditutup oleh Owner. Buat obrolan baru jika ada pertanyaan lain.',
      });
      return;
    }

    const { text } = req.body as { text?: string };
    const cleanText = (text || '').trim().slice(0, 1000);
    if (!cleanText) {
      res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
      return;
    }

    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: `msg-${crypto.randomBytes(4).toString('hex')}`,
      threadId: thread.id,
      senderRole: 'customer',
      senderName: user.name,
      text: cleanText,
      createdAt: now,
      readByOwner: false,
      readByCustomer: true,
      readAt: null,
    };

    thread.messages.push(msg);
    thread.updatedAt = now;
    saveDatabase(db);

    broadcastToOwners('chat:message', msg);
    broadcastToUser(user.id, 'chat:message', msg);

    res.status(201).json({ message: msg, thread });
  });

  app.post('/api/chat/threads/:id/read', requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const thread = db.chatThreads.find(
      (t) => t.id === req.params.id && t.userId === user.id
    );
    if (!thread) {
      res.status(404).json({ error: 'Obrolan tidak ditemukan.' });
      return;
    }
    const updatedIds = markThreadMessagesRead(thread, 'customer');
    res.json({ updatedIds });
  });

  app.post('/api/chat/threads/:id/review', requireUser, (req: AuthedUserRequest, res) => {
    const user = req.customerUser!;
    const thread = db.chatThreads.find(
      (t) => t.id === req.params.id && t.userId === user.id
    );
    if (!thread) {
      res.status(404).json({ error: 'Obrolan tidak ditemukan.' });
      return;
    }
    if (thread.status !== 'closed') {
      res.status(400).json({ error: 'Ulasan hanya dapat diberikan setelah obrolan ditutup.' });
      return;
    }
    if (thread.rating !== null) {
      res.status(400).json({ error: 'Anda sudah memberikan ulasan untuk obrolan ini.' });
      return;
    }

    const { rating, review } = req.body as { rating?: number; review?: string };
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      res.status(400).json({ error: 'Pilih rating antara 1 sampai 5 bintang.' });
      return;
    }

    const now = new Date().toISOString();
    thread.rating = numRating;
    thread.review = (review || '').trim().slice(0, 400) || null;
    thread.ratedAt = now;
    thread.updatedAt = now;
    saveDatabase(db);

    broadcastToOwners('chat:rated', thread);
    broadcastToUser(user.id, 'chat:rated', thread);

    res.json({ thread });
  });

  // ==========================
  // OWNER & RENTAL DASHBOARD API (HARDENED ZERO-TRUST AUTH)
  // ==========================
  app.get('/api/owner/auth/status', (req, res) => {
    const token = extractBearerToken(req);
    const auth = resolveDashboardAuth(token, req);
    res.json({
      initialized: db.ownerAuth.initialized,
      authenticated: auth.valid,
      role: auth.valid ? auth.role : 'owner',
      rentalInfo: auth.valid && auth.rental ? toPublicRental(auth.rental) : null,
    });
  });

  app.post('/api/owner/auth/setup', (req, res) => {
    appendSecurityLog(
      'critical',
      'SETUP_ENDPOINT_PROBE',
      'Percobaan mengakses endpoint setup owner yang sudah dikunci permanen.',
      getClientIp(req),
      getClientUserAgent(req),
      true
    );
    res.status(403).json({
      error:
        'Akun Owner Utama sudah dikunci permanen. Pendaftaran owner baru dinonaktifkan demi keamanan.',
    });
  });

  app.post('/api/owner/auth/login', async (req, res) => {
    if (
      !db.ownerAuth.initialized ||
      !db.ownerAuth.passwordHash ||
      !db.ownerAuth.salt
    ) {
      res.status(500).json({ error: 'Konfigurasi keamanan owner belum siap.' });
      return;
    }
    syncExpiredRentals();

    const ip = getClientIp(req);
    const ua = getClientUserAgent(req);
    const { email, password, username } = req.body as {
      email?: string;
      password?: string;
      username?: string;
    };

    const cleanUsername = (username || '').trim().toLowerCase();

    if (cleanUsername) {
      const tenantKey = `tenant:${ip}`;
      const lock = checkAuthLockout(tenantKey);
      if (lock.locked) {
        res.status(429).json({
          error: `Terlalu banyak percobaan login sewa gagal. Coba lagi dalam ${lock.remainingSeconds} detik.`,
          lockedRemainingSeconds: lock.remainingSeconds,
        });
        return;
      }

      if (!password) {
        res.status(400).json({ error: 'Masukkan username sewa dan kata sandi.' });
        return;
      }
      const rental = db.rentalAccounts.find(
        (r) => r.username.toLowerCase() === cleanUsername
      );
      if (!rental || !verifyPassword(password, rental.salt, rental.passwordHash)) {
        const fail = recordAuthFailure(tenantKey, [
          { count: 5, lockSeconds: 600 },
        ]);
        appendSecurityLog(
          'warning',
          'TENANT_LOGIN_FAILED',
          `Login akun sewa gagal untuk "${cleanUsername}" (percobaan ke-${fail.count}).`,
          ip,
          ua,
          fail.count >= 5
        );
        if (fail.lockedSeconds > 0) {
          res.status(429).json({
            error: `Terlalu banyak percobaan gagal. Akses dikunci ${fail.lockedSeconds} detik.`,
            lockedRemainingSeconds: fail.lockedSeconds,
          });
          return;
        }
        res.status(401).json({ error: 'Username atau kata sandi akun sewa salah.' });
        return;
      }
      const nowMs = Date.now();
      if (rental.status === 'suspended') {
        res.status(403).json({
          error: 'Akun sewa ini sedang ditangguhkan oleh Owner. Silakan hubungi Owner.',
        });
        return;
      }
      if (rental.status === 'expired' || Date.parse(rental.expiresAt) <= nowMs) {
        rental.status = 'expired';
        saveDatabase(db);
        res.status(403).json({
          error: `Masa sewa akun "${rental.username}" sudah habis pada ${formatWibTime(rental.expiresAt)} WIB. Hubungi Owner untuk perpanjangan.`,
        });
        return;
      }

      clearAuthFailures(tenantKey);
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAtMs = Math.min(
        Date.parse(rental.expiresAt),
        nowMs + 24 * 60 * 60 * 1000
      );
      rental.lastLoginAt = new Date().toISOString();
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.expiresAt > nowMs);
      db.ownerAuth.sessions.push({
        id: `ses-${crypto.randomBytes(4).toString('hex')}`,
        token,
        role: 'tenant',
        rentalId: rental.id,
        ip,
        userAgent: ua,
        uaHash: hashUserAgent(ua),
        createdAt: new Date(nowMs).toISOString(),
        lastSeenAt: new Date(nowMs).toISOString(),
        expiresAt: expiresAtMs,
      });
      saveDatabase(db);
      broadcastToPrimaryOwners(
        'rental:sync',
        db.rentalAccounts.map(toPublicRental)
      );

      res.json({
        token,
        authenticated: true,
        role: 'tenant',
        rentalInfo: toPublicRental(rental),
      });
      return;
    }

    // Primary Owner Login (Strict Email + Password + Anti-Brute-Force + Audit Alert)
    const ownerIpKey = `owner:${ip}`;
    const ownerGlobalKey = 'owner:global';
    const ipLock = checkAuthLockout(ownerIpKey);
    const globalLock = checkAuthLockout(ownerGlobalKey);

    if (ipLock.locked || globalLock.locked) {
      const rem = Math.max(ipLock.remainingSeconds, globalLock.remainingSeconds);
      appendSecurityLog(
        'critical',
        'OWNER_LOGIN_LOCKED',
        `Percobaan login saat IP/akses sedang dikunci (sisa ${rem} detik).`,
        ip,
        ua,
        true
      );
      res.status(429).json({
        error: `Akses Owner dikunci sementara demi keamanan karena percobaan gagal berulang. Coba lagi dalam ${rem} detik.`,
        lockedRemainingSeconds: rem,
      });
      return;
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      res.status(400).json({ error: 'Masukkan Gmail Owner dan kata sandi.' });
      return;
    }

    const emailOk = constantTimeEmailMatch(cleanEmail, db.ownerAuth.ownerEmail);
    const passwordOk = verifyPassword(
      password,
      db.ownerAuth.salt,
      db.ownerAuth.passwordHash
    );

    if (!emailOk || !passwordOk) {
      const failIp = recordAuthFailure(ownerIpKey, [
        { count: 3, lockSeconds: 120 },
        { count: 5, lockSeconds: 900 },
        { count: 8, lockSeconds: 3600 },
      ]);
      recordAuthFailure(ownerGlobalKey, [{ count: 15, lockSeconds: 300 }]);

      const masked = maskEmailForLog(cleanEmail);
      const isCrit = failIp.count >= 3;
      appendSecurityLog(
        isCrit ? 'critical' : 'warning',
        'OWNER_LOGIN_FAILED',
        `Percobaan masuk Owner Utama gagal ke-${failIp.count} (email: ${masked}).`,
        ip,
        ua,
        failIp.count >= 2
      );

      if (failIp.count >= 3 && db.settings.ownerWhatsapp) {
        const secMsg = [
          `*PERINGATAN KEAMANAN — ${db.settings.storeName}*`,
          `Terdeteksi ${failIp.count}x percobaan gagal masuk Dashboard Owner Utama.`,
          `Email dicoba: ${masked}`,
          `IP: ${ip}`,
          `Waktu: ${formatWibTime(new Date().toISOString())} WIB`,
          failIp.lockedSeconds > 0
            ? `Status: IP otomatis dikunci selama ${failIp.lockedSeconds} detik.`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        void sendWhatsAppNotification(secMsg, 'manual_test', {
          securityAlert: true,
          ip,
        });
      }

      if (failIp.lockedSeconds > 0) {
        res.status(429).json({
          error: `Terlalu banyak percobaan gagal. Akses Owner dikunci sementara selama ${failIp.lockedSeconds} detik.`,
          lockedRemainingSeconds: failIp.lockedSeconds,
        });
        return;
      }

      res.status(401).json({ error: 'Gmail Owner atau kata sandi salah.' });
      return;
    }

    clearAuthFailures(ownerIpKey);
    clearAuthFailures(ownerGlobalKey);

    const token = crypto.randomBytes(32).toString('hex');
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.expiresAt > nowMs);
    db.ownerAuth.sessions.push({
      id: `ses-${crypto.randomBytes(4).toString('hex')}`,
      token,
      role: 'owner',
      ip,
      userAgent: ua,
      uaHash: hashUserAgent(ua),
      createdAt: nowIso,
      lastSeenAt: nowIso,
      expiresAt: nowMs + 24 * 60 * 60 * 1000,
    });
    appendSecurityLog(
      'info',
      'OWNER_LOGIN_SUCCESS',
      'Owner Utama berhasil masuk dengan verifikasi Gmail & kata sandi.',
      ip,
      ua,
      false
    );

    res.json({ token, authenticated: true, role: 'owner', rentalInfo: null });
  });

  app.post('/api/owner/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.token !== token);
      saveDatabase(db);
    }
    res.json({ ok: true });
  });

  app.post('/api/owner/auth/change-password', requirePrimaryOwner, (req: AuthedDashboardRequest, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (!db.ownerAuth.salt || !db.ownerAuth.passwordHash) {
      res.status(400).json({ error: 'Status akun tidak valid.' });
      return;
    }
    const ok = verifyPassword(currentPassword, db.ownerAuth.salt, db.ownerAuth.passwordHash);
    if (!ok) {
      appendSecurityLog(
        'warning',
        'OWNER_PASSWORD_CHANGE_FAILED',
        'Percobaan ubah kata sandi gagal karena sandi lama tidak cocok.',
        getClientIp(req),
        getClientUserAgent(req),
        true
      );
      res.status(401).json({ error: 'Kata sandi saat ini salah.' });
      return;
    }
    const newSalt = crypto.randomBytes(24).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);
    db.ownerAuth.salt = newSalt;
    db.ownerAuth.passwordHash = newHash;

    // Sync password digest with the registered Owner customer account
    const ownerCustomer = db.users.find((u) => isReservedOwnerUser(u));
    if (ownerCustomer) {
      ownerCustomer.salt = newSalt;
      ownerCustomer.passwordHash = newHash;
    }

    // Revoke all OTHER primary owner sessions immediately
    const removedTokens = new Set<string>();
    db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => {
      if ((s.role || 'owner') === 'owner' && s.token !== req.dashboardToken) {
        removedTokens.add(s.token);
        return false;
      }
      return true;
    });
    if (removedTokens.size > 0) {
      evictOwnerSocketsByTokens(
        removedTokens,
        'Kata sandi Owner diubah. Sesi lain otomatis dikeluarkan.'
      );
    }
    appendSecurityLog(
      'info',
      'OWNER_PASSWORD_CHANGED',
      'Kata sandi Owner Utama diperbarui & sesi perangkat lain dikeluarkan.',
      getClientIp(req),
      getClientUserAgent(req),
      false
    );
    res.json({
      ok: true,
      activeOwnerSessions: toPublicOwnerSessions(req.dashboardToken || null),
    });
  });

  app.post(
    '/api/owner/security/revoke-sessions',
    requirePrimaryOwner,
    (req: AuthedDashboardRequest, res) => {
      const { includeCurrent } = (req.body || {}) as { includeCurrent?: boolean };
      const removedTokens = new Set<string>();
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => {
        if ((s.role || 'owner') !== 'owner') return true;
        if (!includeCurrent && s.token === req.dashboardToken) return true;
        removedTokens.add(s.token);
        return false;
      });
      if (removedTokens.size > 0) {
        evictOwnerSocketsByTokens(
          removedTokens,
          'Sesi Owner dicabut secara paksa oleh Owner Utama.'
        );
      }
      appendSecurityLog(
        'warning',
        'SESSIONS_REVOKED',
        `${removedTokens.size} sesi Owner dicabut secara paksa.`,
        getClientIp(req),
        getClientUserAgent(req),
        false
      );
      res.json({
        ok: true,
        revokedCount: removedTokens.size,
        activeOwnerSessions: toPublicOwnerSessions(
          includeCurrent ? null : req.dashboardToken || null
        ),
      });
    }
  );

  app.delete(
    '/api/owner/security/sessions/:id',
    requirePrimaryOwner,
    (req: AuthedDashboardRequest, res) => {
      const targetId = req.params.id;
      const target = db.ownerAuth.sessions.find(
        (s) => (s.role || 'owner') === 'owner' && (s.id || s.token.slice(0, 10)) === targetId
      );
      if (!target) {
        res.status(404).json({ error: 'Sesi tidak ditemukan.' });
        return;
      }
      if (target.token === req.dashboardToken) {
        res.status(400).json({ error: 'Gunakan tombol Keluar untuk menutup sesi saat ini.' });
        return;
      }
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter((s) => s.token !== target.token);
      evictOwnerSocketsByTokens(
        new Set([target.token]),
        'Sesi ini dicabut dari Dashboard Keamanan Owner.'
      );
      appendSecurityLog(
        'info',
        'SESSION_REVOKED',
        `Sesi ${targetId} (${target.ip || 'unknown'}) dicabut oleh Owner.`,
        getClientIp(req),
        getClientUserAgent(req),
        false
      );
      res.json({
        activeOwnerSessions: toPublicOwnerSessions(req.dashboardToken || null),
      });
    }
  );

  app.post('/api/owner/security/clear-locks', requirePrimaryOwner, (req, res) => {
    authRateLimiter.clear();
    appendSecurityLog(
      'info',
      'LOCKS_CLEARED',
      'Daftar pemblokiran sementara IP direset oleh Owner Utama.',
      getClientIp(req),
      getClientUserAgent(req),
      false
    );
    res.json({ ok: true });
  });

  app.get('/api/owner/bootstrap', requireOwner, (req: AuthedDashboardRequest, res) => {
    const isPrimary = req.dashboardRole === 'owner';
    if (!isPrimary && req.rentalAccount) {
      const hadWorkspace = Boolean(req.rentalAccount.workspace);
      const workspace = ensureTenantWorkspace(req.rentalAccount);
      if (!hadWorkspace) {
        saveDatabase(db);
      }
      res.json({
        role: 'tenant',
        rentalInfo: toPublicRental(req.rentalAccount),
        tenantWorkspace: workspace,
      });
      return;
    }

    res.json({
      role: 'owner',
      rentalInfo: null,
      ownerEmail: db.ownerAuth.ownerEmail,
      settings: db.settings,
      services: db.services,
      orders: db.orders,
      topups: db.topups,
      users: db.users.map(toPublicUser),
      walletTransactions: db.walletTransactions,
      chatThreads: [...db.chatThreads].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
      broadcasts: [...db.broadcasts].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
      storeOperation: db.storeOperation,
      effectiveOperation: computeStoreOperationState(),
      rentals: db.rentalAccounts.map(toPublicRental),
      rentalControl: db.rentalControl,
      securityLogs: db.securityLogs,
      activeOwnerSessions: toPublicOwnerSessions(req.dashboardToken || null),
    });
  });

  // ========================================================
  // ISOLATED TENANT WORKSPACE ENDPOINTS (KHUSUS PENYEWA)
  // Tidak dapat melihat atau mengubah data/pengaturan Owner Utama
  // ========================================================
  app.post('/api/tenant/settings', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const body = req.body as Partial<TenantWorkspaceData>;

    if (typeof body.storeTitle === 'string' && body.storeTitle.trim()) {
      workspace.storeTitle = body.storeTitle.trim().slice(0, 60);
    }
    if (typeof body.whatsapp === 'string') {
      workspace.whatsapp = normalizeWhatsappNumber(body.whatsapp);
    }
    if (typeof body.telegram === 'string') {
      workspace.telegram = normalizeTelegramUsername(body.telegram);
    }
    if (typeof body.qrisMerchantName === 'string' && body.qrisMerchantName.trim()) {
      workspace.qrisMerchantName = body.qrisMerchantName.trim().slice(0, 80);
    }
    if (typeof body.paymentInstruction === 'string') {
      workspace.paymentInstruction = body.paymentInstruction.trim().slice(0, 300);
    }
    workspace.updatedAt = new Date().toISOString();
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.json({ tenantWorkspace: workspace });
  });

  app.post('/api/tenant/qris', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const { dataBase64, mimeType } = req.body as {
      dataBase64?: string;
      mimeType?: string;
    };
    if (!dataBase64) {
      res.status(400).json({ error: 'Pilih file gambar QRIS terlebih dahulu.' });
      return;
    }
    let qrisUrl: string;
    try {
      qrisUrl = saveBase64Image(dataBase64, mimeType, `qris-tenant-${rental.id.toLowerCase()}`);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal unggah QRIS.' });
      return;
    }
    if (workspace.qrisImageUrl) {
      removeUploadedFileIfLocal(workspace.qrisImageUrl);
    }
    workspace.qrisImageUrl = qrisUrl;
    workspace.updatedAt = new Date().toISOString();
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.json({ tenantWorkspace: workspace });
  });

  app.delete('/api/tenant/qris', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    if (workspace.qrisImageUrl) {
      removeUploadedFileIfLocal(workspace.qrisImageUrl);
      workspace.qrisImageUrl = null;
      workspace.updatedAt = new Date().toISOString();
      saveDatabase(db);
      broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    }
    res.json({ tenantWorkspace: workspace });
  });

  app.post('/api/tenant/services', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const { appName, country, countryCode, price, stock, estimatedTime, active } =
      req.body as Partial<TenantWorkspaceService>;

    if (!appName?.trim() || !country?.trim() || !countryCode?.trim()) {
      res.status(400).json({ error: 'Nama aplikasi, negara, dan kode negara wajib diisi.' });
      return;
    }
    const numPrice = Number(price);
    const numStock = Number(stock);
    if (!Number.isFinite(numPrice) || numPrice < 500) {
      res.status(400).json({ error: 'Harga layanan minimal Rp 500.' });
      return;
    }
    if (!Number.isInteger(numStock) || numStock < 0) {
      res.status(400).json({ error: 'Stok harus berupa angka 0 atau lebih.' });
      return;
    }
    const now = new Date().toISOString();
    const created: TenantWorkspaceService = {
      id: `tsrv-${crypto.randomBytes(4).toString('hex')}`,
      appName: appName.trim().slice(0, 50),
      country: country.trim().slice(0, 50),
      countryCode: countryCode.trim().startsWith('+')
        ? countryCode.trim().slice(0, 8)
        : `+${countryCode.trim().slice(0, 7)}`,
      price: Math.round(numPrice),
      stock: numStock,
      estimatedTime: (estimatedTime || '1-5 Menit').trim().slice(0, 40),
      active: active !== false,
      updatedAt: now,
    };
    workspace.services.unshift(created);
    workspace.updatedAt = now;
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.status(201).json({ tenantWorkspace: workspace });
  });

  app.put('/api/tenant/services/:id', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const srv = workspace.services.find((s) => s.id === req.params.id);
    if (!srv) {
      res.status(404).json({ error: 'Layanan penyewa tidak ditemukan.' });
      return;
    }
    const body = req.body as Partial<TenantWorkspaceService>;
    if (typeof body.appName === 'string' && body.appName.trim()) {
      srv.appName = body.appName.trim().slice(0, 50);
    }
    if (typeof body.country === 'string' && body.country.trim()) {
      srv.country = body.country.trim().slice(0, 50);
    }
    if (typeof body.countryCode === 'string' && body.countryCode.trim()) {
      const code = body.countryCode.trim();
      srv.countryCode = code.startsWith('+') ? code.slice(0, 8) : `+${code.slice(0, 7)}`;
    }
    if (body.price !== undefined) {
      const p = Number(body.price);
      if (!Number.isFinite(p) || p < 500) {
        res.status(400).json({ error: 'Harga minimal Rp 500.' });
        return;
      }
      srv.price = Math.round(p);
    }
    if (body.stock !== undefined) {
      const st = Number(body.stock);
      if (!Number.isInteger(st) || st < 0) {
        res.status(400).json({ error: 'Stok tidak valid.' });
        return;
      }
      srv.stock = st;
    }
    if (typeof body.estimatedTime === 'string') {
      srv.estimatedTime = body.estimatedTime.trim().slice(0, 40);
    }
    if (typeof body.active === 'boolean') {
      srv.active = body.active;
    }
    const now = new Date().toISOString();
    srv.updatedAt = now;
    workspace.updatedAt = now;
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.json({ tenantWorkspace: workspace });
  });

  app.delete('/api/tenant/services/:id', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const idx = workspace.services.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Layanan tidak ditemukan.' });
      return;
    }
    workspace.services.splice(idx, 1);
    workspace.updatedAt = new Date().toISOString();
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.json({ tenantWorkspace: workspace });
  });

  app.post('/api/tenant/orders', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const {
      customerName,
      customerContact,
      appName,
      country,
      quantity,
      totalAmount,
      assignedNumber,
      otpCode,
      note,
      status,
    } = req.body as Partial<TenantWorkspaceOrder>;

    if (!customerName?.trim() || !appName?.trim()) {
      res.status(400).json({ error: 'Nama pelanggan dan aplikasi wajib diisi.' });
      return;
    }
    const qty = Math.max(1, Math.min(50, Math.round(Number(quantity || 1))));
    const amount = Math.max(0, Math.round(Number(totalAmount || 0)));
    const validStatus: TenantOrderStatus =
      status === 'processing' || status === 'completed' || status === 'cancelled'
        ? status
        : 'pending';
    const now = new Date().toISOString();
    const order: TenantWorkspaceOrder = {
      id: `TORD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      customerName: customerName.trim().slice(0, 60),
      customerContact: (customerContact || '').trim().slice(0, 40),
      appName: appName.trim().slice(0, 40),
      country: (country || 'Indonesia').trim().slice(0, 40),
      quantity: qty,
      totalAmount: amount,
      assignedNumber: (assignedNumber || '').trim().slice(0, 40),
      otpCode: (otpCode || '').trim().slice(0, 20),
      note: (note || '').trim().slice(0, 200),
      status: validStatus,
      createdAt: now,
      updatedAt: now,
    };
    workspace.orders.unshift(order);
    workspace.updatedAt = now;
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.status(201).json({ order, tenantWorkspace: workspace });
  });

  app.patch('/api/tenant/orders/:id', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const order = workspace.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan penyewa tidak ditemukan.' });
      return;
    }
    const body = req.body as Partial<TenantWorkspaceOrder>;
    if (typeof body.assignedNumber === 'string') {
      order.assignedNumber = body.assignedNumber.trim().slice(0, 40);
    }
    if (typeof body.otpCode === 'string') {
      order.otpCode = body.otpCode.trim().slice(0, 20);
    }
    if (typeof body.note === 'string') {
      order.note = body.note.trim().slice(0, 200);
    }
    if (
      body.status === 'pending' ||
      body.status === 'processing' ||
      body.status === 'completed' ||
      body.status === 'cancelled'
    ) {
      order.status = body.status;
    }
    const now = new Date().toISOString();
    order.updatedAt = now;
    workspace.updatedAt = now;
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.json({ order, tenantWorkspace: workspace });
  });

  app.delete('/api/tenant/orders/:id', requireTenant, (req: AuthedDashboardRequest, res) => {
    const rental = req.rentalAccount!;
    const workspace = ensureTenantWorkspace(rental);
    const idx = workspace.orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    workspace.orders.splice(idx, 1);
    workspace.updatedAt = new Date().toISOString();
    saveDatabase(db);
    broadcastToTenant(rental.id, 'tenant:workspace_updated', workspace);
    res.json({ tenantWorkspace: workspace });
  });

  // Store Operational Status: Open / Close / Maintenance + Days & Hours + Descriptions (PRIMARY OWNER ONLY)
  app.post('/api/owner/operation', requirePrimaryOwner, (req, res) => {
    const body = req.body as Partial<StoreOperationSettings>;
    const validDays = new Set<WeekdayCode>([
      'Sen',
      'Sel',
      'Rab',
      'Kam',
      'Jum',
      'Sab',
      'Min',
    ]);

    if (
      body.mode === 'open' ||
      body.mode === 'close' ||
      body.mode === 'maintenance'
    ) {
      db.storeOperation.mode = body.mode;
    }
    if (typeof body.autoBySchedule === 'boolean') {
      db.storeOperation.autoBySchedule = body.autoBySchedule;
    }
    if (Array.isArray(body.openDays)) {
      const cleanedDays = WEEKDAY_ORDER.filter((d) =>
        body.openDays!.includes(d) && validDays.has(d)
      );
      if (cleanedDays.length === 0) {
        res.status(400).json({ error: 'Pilih minimal 1 hari operasional.' });
        return;
      }
      db.storeOperation.openDays = cleanedDays;
    }
    if (typeof body.openTime === 'string') {
      if (!/^\d{2}:\d{2}$/.test(body.openTime.trim())) {
        res.status(400).json({ error: 'Format jam buka harus HH:MM (contoh: 08:00).' });
        return;
      }
      db.storeOperation.openTime = body.openTime.trim();
    }
    if (typeof body.closeTime === 'string') {
      if (!/^\d{2}:\d{2}$/.test(body.closeTime.trim())) {
        res.status(400).json({ error: 'Format jam tutup harus HH:MM (contoh: 22:00).' });
        return;
      }
      db.storeOperation.closeTime = body.closeTime.trim();
    }
    if (typeof body.openDescription === 'string') {
      db.storeOperation.openDescription = body.openDescription.trim().slice(0, 320);
    }
    if (typeof body.closeDescription === 'string') {
      db.storeOperation.closeDescription = body.closeDescription.trim().slice(0, 320);
    }
    if (typeof body.maintenanceDescription === 'string') {
      db.storeOperation.maintenanceDescription = body.maintenanceDescription
        .trim()
        .slice(0, 320);
    }

    db.storeOperation.updatedAt = new Date().toISOString();
    saveDatabase(db);
    const effective = computeStoreOperationState();
    lastBroadcastedOperationSignature = `${effective.effectiveMode}|${effective.scheduleSummary}|${effective.activeDescription}|${effective.updatedAt}`;
    broadcastToAll('store:operation_updated', effective);

    res.json({
      storeOperation: db.storeOperation,
      effectiveOperation: effective,
    });
  });

  // ==========================
  // PRIMARY OWNER ONLY: WEB RENTAL & ACCOUNT MANAGEMENT
  // (Blocked for Tenants & Customers via requirePrimaryOwner)
  // ==========================
  app.post('/api/owner/rentals', requirePrimaryOwner, (req, res) => {
    const {
      tenantName,
      username,
      password,
      tenantWhatsapp,
      durationDays,
      priceAmount,
      note,
      enableWebLock,
    } = req.body as {
      tenantName?: string;
      username?: string;
      password?: string;
      tenantWhatsapp?: string;
      durationDays?: number;
      priceAmount?: number;
      note?: string;
      enableWebLock?: boolean;
    };

    const cleanTenantName = (tenantName || '').trim().slice(0, 80);
    const cleanUsername = (username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 40);
    const cleanPass = (password || '').trim();
    const days = Math.round(Number(durationDays));
    const price = Math.max(0, Math.round(Number(priceAmount || 0)));

    if (cleanTenantName.length < 2) {
      res.status(400).json({ error: 'Nama penyewa minimal 2 karakter.' });
      return;
    }
    if (cleanUsername.length < 3) {
      res.status(400).json({
        error: 'Username login sewa minimal 3 karakter (huruf, angka, titik, atau garis bawah).',
      });
      return;
    }
    if (cleanPass.length < 6) {
      res.status(400).json({ error: 'Kata sandi akun sewa minimal 6 karakter.' });
      return;
    }
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      res.status(400).json({ error: 'Durasi sewa harus antara 1 hingga 3650 hari.' });
      return;
    }
    if (db.rentalAccounts.some((r) => r.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: 'Username akun sewa tersebut sudah dipakai.' });
      return;
    }

    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(cleanPass, salt);

    const created: StoredRentalAccount = {
      id: `SEWA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      tenantName: cleanTenantName,
      username: cleanUsername,
      tenantWhatsapp: normalizeWhatsappNumber(tenantWhatsapp || ''),
      durationDays: days,
      priceAmount: Number.isFinite(price) ? price : 0,
      note: (note || '').trim().slice(0, 240),
      status: 'active',
      startedAt,
      expiresAt,
      createdAt: startedAt,
      updatedAt: startedAt,
      lastLoginAt: null,
      passwordHash,
      salt,
    };

    db.rentalAccounts.unshift(created);
    if (enableWebLock === true) {
      db.rentalControl.webLockMode = true;
    }
    saveDatabase(db);

    const publicList = db.rentalAccounts.map(toPublicRental);
    const lockState = getPublicRentalLockState();
    broadcastToPrimaryOwners('rental:sync', publicList);
    broadcastToAll('rental:web_state', lockState);

    res.status(201).json({
      rental: toPublicRental(created),
      plainPassword: cleanPass,
      rentals: publicList,
      rentalControl: db.rentalControl,
      rentalLock: lockState,
    });
  });

  app.patch('/api/owner/rentals/:id', requirePrimaryOwner, (req, res) => {
    const rental = db.rentalAccounts.find((r) => r.id === req.params.id);
    if (!rental) {
      res.status(404).json({ error: 'Akun sewa tidak ditemukan.' });
      return;
    }

    const {
      addDays,
      setDays,
      status,
      tenantName,
      tenantWhatsapp,
      priceAmount,
      note,
      newPassword,
    } = req.body as {
      addDays?: number;
      setDays?: number;
      status?: 'active' | 'suspended';
      tenantName?: string;
      tenantWhatsapp?: string;
      priceAmount?: number;
      note?: string;
      newPassword?: string;
    };

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (typeof tenantName === 'string' && tenantName.trim().length >= 2) {
      rental.tenantName = tenantName.trim().slice(0, 80);
    }
    if (typeof tenantWhatsapp === 'string') {
      rental.tenantWhatsapp = normalizeWhatsappNumber(tenantWhatsapp);
    }
    if (typeof priceAmount === 'number' && Number.isFinite(priceAmount) && priceAmount >= 0) {
      rental.priceAmount = Math.round(priceAmount);
    }
    if (typeof note === 'string') {
      rental.note = note.trim().slice(0, 240);
    }
    if (typeof newPassword === 'string' && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      const newSalt = crypto.randomBytes(16).toString('hex');
      rental.salt = newSalt;
      rental.passwordHash = hashPassword(newPassword.trim(), newSalt);
    }

    if (typeof setDays === 'number' && Number.isFinite(setDays) && setDays >= 1) {
      const days = Math.min(3650, Math.round(setDays));
      rental.durationDays = days;
      rental.startedAt = nowIso;
      rental.expiresAt = new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
      rental.status = 'active';
    } else if (typeof addDays === 'number' && Number.isFinite(addDays) && addDays !== 0) {
      const extraDays = Math.round(addDays);
      const baseMs = Math.max(nowMs, Date.parse(rental.expiresAt));
      const nextExpiresMs = baseMs + extraDays * 24 * 60 * 60 * 1000;
      rental.durationDays = Math.max(1, rental.durationDays + extraDays);
      rental.expiresAt = new Date(nextExpiresMs).toISOString();
      rental.status = nextExpiresMs > nowMs ? 'active' : 'expired';
    }

    if (status === 'suspended') {
      rental.status = 'suspended';
    } else if (status === 'active') {
      if (Date.parse(rental.expiresAt) <= nowMs) {
        res.status(400).json({
          error: 'Masa berlaku sudah habis. Tambahkan jumlah hari terlebih dahulu untuk mengaktifkan kembali.',
        });
        return;
      }
      rental.status = 'active';
    }

    rental.updatedAt = nowIso;

    if (rental.status !== 'active') {
      db.ownerAuth.sessions = db.ownerAuth.sessions.filter(
        (s) => s.rentalId !== rental.id
      );
      evictTenantSockets(
        rental.id,
        rental.status === 'suspended'
          ? 'Akun sewa Anda dinonaktifkan sementara oleh Owner.'
          : 'Masa sewa akun dashboard Anda telah berakhir.'
      );
    }

    saveDatabase(db);
    const publicList = db.rentalAccounts.map(toPublicRental);
    const lockState = getPublicRentalLockState();
    broadcastToPrimaryOwners('rental:sync', publicList);
    broadcastToAll('rental:web_state', lockState);

    res.json({
      rental: toPublicRental(rental),
      rentals: publicList,
      rentalLock: lockState,
    });
  });

  app.delete('/api/owner/rentals/:id', requirePrimaryOwner, (req, res) => {
    const idx = db.rentalAccounts.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Akun sewa tidak ditemukan.' });
      return;
    }
    const [removed] = db.rentalAccounts.splice(idx, 1);
    db.ownerAuth.sessions = db.ownerAuth.sessions.filter(
      (s) => s.rentalId !== removed.id
    );
    evictTenantSockets(removed.id, 'Akun sewa Anda telah dihapus oleh Owner.');
    saveDatabase(db);

    const publicList = db.rentalAccounts.map(toPublicRental);
    const lockState = getPublicRentalLockState();
    broadcastToPrimaryOwners('rental:sync', publicList);
    broadcastToAll('rental:web_state', lockState);
    res.json({ rentals: publicList, rentalLock: lockState });
  });

  app.post('/api/owner/rentals/control', requirePrimaryOwner, (req, res) => {
    const { webLockMode, lockMessage } = req.body as Partial<RentalControlSettings>;
    if (typeof webLockMode === 'boolean') {
      db.rentalControl.webLockMode = webLockMode;
    }
    if (typeof lockMessage === 'string' && lockMessage.trim()) {
      db.rentalControl.lockMessage = lockMessage.trim().slice(0, 300);
    }
    saveDatabase(db);
    const lockState = getPublicRentalLockState();
    broadcastToAll('rental:web_state', lockState);
    res.json({ rentalControl: db.rentalControl, rentalLock: lockState });
  });

  // Owner settings & QRIS upload (PRIMARY OWNER ONLY)
  app.post('/api/owner/settings', requirePrimaryOwner, (req, res) => {
    const body = req.body as Partial<OwnerSettings>;
    if (typeof body.storeName === 'string' && body.storeName.trim()) {
      db.settings.storeName = body.storeName.trim().slice(0, 60);
    }
    if (typeof body.ownerWhatsapp === 'string') {
      db.settings.ownerWhatsapp = normalizeWhatsappNumber(body.ownerWhatsapp);
    }
    if (typeof body.ownerTelegram === 'string') {
      db.settings.ownerTelegram = normalizeTelegramUsername(body.ownerTelegram);
    }
    if (typeof body.qrisMerchantName === 'string') {
      db.settings.qrisMerchantName = body.qrisMerchantName.trim().slice(0, 80);
    }
    if (typeof body.paymentInstruction === 'string') {
      db.settings.paymentInstruction = body.paymentInstruction.trim().slice(0, 300);
    }
    if (
      body.whatsappMode === 'direct' ||
      body.whatsappMode === 'fonnte' ||
      body.whatsappMode === 'webhook'
    ) {
      db.settings.whatsappMode = body.whatsappMode;
    }
    if (typeof body.whatsappApiToken === 'string') {
      db.settings.whatsappApiToken = body.whatsappApiToken.trim();
    }
    if (typeof body.whatsappWebhookUrl === 'string') {
      db.settings.whatsappWebhookUrl = body.whatsappWebhookUrl.trim();
    }
    if (typeof body.notifyOnNewOrder === 'boolean') {
      db.settings.notifyOnNewOrder = body.notifyOnNewOrder;
    }
    if (typeof body.notifyOnPaymentProof === 'boolean') {
      db.settings.notifyOnPaymentProof = body.notifyOnPaymentProof;
    }
    if (
      body.nokosProviderMode === 'manual' ||
      body.nokosProviderMode === 'fivesim' ||
      body.nokosProviderMode === 'sms_activate'
    ) {
      db.settings.nokosProviderMode = body.nokosProviderMode;
    }
    if (typeof body.nokosApiKey === 'string') {
      db.settings.nokosApiKey = body.nokosApiKey.trim();
    }
    if (typeof body.nokosBaseUrl === 'string') {
      db.settings.nokosBaseUrl = body.nokosBaseUrl.trim();
    }

    saveDatabase(db);
    broadcastToAll('store:settings_updated', getPublicSettings(db.settings));
    res.json({ settings: db.settings });
  });

  // Owner Permanent Customer Account Management (PRIMARY OWNER ONLY)
  app.post('/api/owner/users/:id/reset-password', requirePrimaryOwner, (req: AuthedDashboardRequest, res) => {
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      return;
    }

    if (isReservedOwnerUser(user) && req.dashboardRole !== 'owner') {
      appendSecurityLog(
        'critical',
        'PRIVILEGE_ESCALATION_BLOCKED',
        `Akun sewa "${req.rentalAccount?.username || 'unknown'}" mencoba mereset akun Owner Utama.`,
        getClientIp(req),
        getClientUserAgent(req),
        true
      );
      res.status(403).json({
        error: 'Akses ditolak. Akun Owner Utama tidak dapat diubah oleh akun sewa.',
      });
      return;
    }

    const { name, newPassword } = req.body as {
      name?: string;
      newPassword?: string;
    };

    if (typeof name === 'string' && name.trim()) {
      if (name.trim().length < 2) {
        res.status(400).json({ error: 'Nama / username minimal 2 karakter.' });
        return;
      }
      user.name = name.trim().slice(0, 80);
    }

    if (typeof newPassword === 'string' && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      const newSalt = crypto.randomBytes(24).toString('hex');
      const newHash = hashPassword(newPassword.trim(), newSalt);
      user.salt = newSalt;
      user.passwordHash = newHash;
      if (isReservedOwnerUser(user)) {
        db.ownerAuth.salt = newSalt;
        db.ownerAuth.passwordHash = newHash;
      }
    }

    saveDatabase(db);
    const pubUser = toPublicUser(user);
    broadcastToOwners('user:updated', pubUser);
    res.json({ user: pubUser });
  });

  app.post('/api/owner/users/:id/adjust-balance', requirePrimaryOwner, (req: AuthedDashboardRequest, res) => {
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      return;
    }

    if (isReservedOwnerUser(user) && req.dashboardRole !== 'owner') {
      appendSecurityLog(
        'critical',
        'PRIVILEGE_ESCALATION_BLOCKED',
        `Akun sewa "${req.rentalAccount?.username || 'unknown'}" mencoba mengubah saldo akun Owner Utama.`,
        getClientIp(req),
        getClientUserAgent(req),
        true
      );
      res.status(403).json({
        error: 'Akses ditolak. Akun Owner Utama tidak dapat diubah oleh akun sewa.',
      });
      return;
    }

    const { amount, note } = req.body as { amount?: number; note?: string };
    const delta = Math.round(Number(amount));
    if (!Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ error: 'Masukkan nominal penyesuaian saldo yang valid.' });
      return;
    }
    if (user.balance + delta < 0) {
      res.status(400).json({ error: 'Saldo akhir pengguna tidak boleh kurang dari Rp 0.' });
      return;
    }

    const tx = recordWalletTransaction(
      user,
      'admin_adjustment',
      delta,
      (note || '').trim().slice(0, 140) ||
        (delta > 0 ? 'Penambahan saldo oleh Owner' : 'Pengurangan saldo oleh Owner'),
      null
    );

    saveDatabase(db);
    const pubUser = toPublicUser(user);
    broadcastToOwners('user:updated', pubUser);
    broadcastToUser(user.id, 'wallet:update', {
      balance: user.balance,
      transaction: tx,
    });
    res.json({ user: pubUser, transaction: tx });
  });

  // Owner Broadcast Announcements (PRIMARY OWNER ONLY)
  app.post('/api/owner/broadcasts', requirePrimaryOwner, (req, res) => {
    const { title, message, priority, active } = req.body as {
      title?: string;
      message?: string;
      priority?: BroadcastPriority;
      active?: boolean;
    };

    const cleanTitle = (title || '').trim().slice(0, 100);
    const cleanMsg = (message || '').trim().slice(0, 600);
    if (cleanTitle.length < 3 || cleanMsg.length < 3) {
      res.status(400).json({ error: 'Judul dan isi pengumuman minimal 3 karakter.' });
      return;
    }

    const validPriority: BroadcastPriority =
      priority === 'important' || priority === 'urgent' ? priority : 'info';
    const now = new Date().toISOString();
    const item: BroadcastAnnouncement = {
      id: `BRD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      title: cleanTitle,
      message: cleanMsg,
      priority: validPriority,
      active: active !== false,
      createdAt: now,
      updatedAt: now,
    };

    db.broadcasts.unshift(item);
    saveDatabase(db);
    broadcastToAll(
      'broadcast:sync',
      db.broadcasts.filter((b) => b.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
    res.status(201).json({ broadcast: item, broadcasts: db.broadcasts });
  });

  app.patch('/api/owner/broadcasts/:id', requirePrimaryOwner, (req, res) => {
    const item = db.broadcasts.find((b) => b.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Pengumuman tidak ditemukan.' });
      return;
    }
    const { title, message, priority, active } = req.body as Partial<BroadcastAnnouncement>;
    if (typeof title === 'string' && title.trim().length >= 3) {
      item.title = title.trim().slice(0, 100);
    }
    if (typeof message === 'string' && message.trim().length >= 3) {
      item.message = message.trim().slice(0, 600);
    }
    if (priority === 'info' || priority === 'important' || priority === 'urgent') {
      item.priority = priority;
    }
    if (typeof active === 'boolean') {
      item.active = active;
    }
    item.updatedAt = new Date().toISOString();

    saveDatabase(db);
    broadcastToAll(
      'broadcast:sync',
      db.broadcasts.filter((b) => b.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
    res.json({ broadcast: item, broadcasts: db.broadcasts });
  });

  app.delete('/api/owner/broadcasts/:id', requirePrimaryOwner, (req, res) => {
    const idx = db.broadcasts.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pengumuman tidak ditemukan.' });
      return;
    }
    db.broadcasts.splice(idx, 1);
    saveDatabase(db);
    broadcastToAll(
      'broadcast:sync',
      db.broadcasts.filter((b) => b.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
    res.json({ broadcasts: db.broadcasts });
  });

  app.post('/api/owner/provider/test', requirePrimaryOwner, async (req, res) => {
    const body = req.body as Partial<OwnerSettings>;
    const tempSettings: OwnerSettings = {
      ...db.settings,
      nokosProviderMode:
        body.nokosProviderMode === 'manual' ||
        body.nokosProviderMode === 'fivesim' ||
        body.nokosProviderMode === 'sms_activate'
          ? body.nokosProviderMode
          : db.settings.nokosProviderMode,
      nokosApiKey:
        typeof body.nokosApiKey === 'string'
          ? body.nokosApiKey.trim()
          : db.settings.nokosApiKey,
      nokosBaseUrl:
        typeof body.nokosBaseUrl === 'string'
          ? body.nokosBaseUrl.trim()
          : db.settings.nokosBaseUrl,
    };
    const result = await testProviderConnection(tempSettings);
    res.json(result);
  });

  app.post('/api/owner/qris', requirePrimaryOwner, (req, res) => {
    const { dataBase64, mimeType, qrisMerchantName, paymentInstruction } = req.body as {
      dataBase64?: string;
      mimeType?: string;
      qrisMerchantName?: string;
      paymentInstruction?: string;
    };

    if (!dataBase64) {
      res.status(400).json({ error: 'Pilih file gambar QRIS terlebih dahulu.' });
      return;
    }

    let qrisUrl: string;
    try {
      qrisUrl = saveBase64Image(dataBase64, mimeType, 'qris-owner');
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal unggah QRIS.' });
      return;
    }

    if (db.settings.qrisImageUrl) {
      removeUploadedFileIfLocal(db.settings.qrisImageUrl);
    }

    db.settings.qrisImageUrl = qrisUrl;
    if (typeof qrisMerchantName === 'string' && qrisMerchantName.trim()) {
      db.settings.qrisMerchantName = qrisMerchantName.trim().slice(0, 80);
    }
    if (typeof paymentInstruction === 'string' && paymentInstruction.trim()) {
      db.settings.paymentInstruction = paymentInstruction.trim().slice(0, 300);
    }

    saveDatabase(db);
    res.json({ settings: db.settings });
  });

  app.delete('/api/owner/qris', requirePrimaryOwner, (_req, res) => {
    if (db.settings.qrisImageUrl) {
      removeUploadedFileIfLocal(db.settings.qrisImageUrl);
      db.settings.qrisImageUrl = null;
      saveDatabase(db);
    }
    res.json({ settings: db.settings });
  });

  app.post('/api/owner/whatsapp/test', requirePrimaryOwner, async (_req, res) => {
    const testMessage = [
      `*TES NOTIFIKASI REAL-TIME — ${db.settings.storeName}*`,
      `Status koneksi WhatsApp admin aktif.`,
      `Waktu: ${formatWibTime(new Date().toISOString())} WIB`,
    ].join('\n');

    const log = await sendWhatsAppNotification(testMessage, 'manual_test', {
      test: true,
    });
    res.json({ log });
  });

  // Owner services CRUD (PRIMARY OWNER ONLY)
  app.post('/api/owner/services', requirePrimaryOwner, (req, res) => {
    const {
      appName,
      country,
      countryCode,
      price,
      stock,
      estimatedTime,
      description,
      active,
      providerProductCode,
      providerCountryCode,
    } = req.body as Partial<NokosService>;

    if (!appName?.trim() || !country?.trim() || !countryCode?.trim()) {
      res.status(400).json({ error: 'Nama aplikasi, negara, dan kode negara wajib diisi.' });
      return;
    }
    const numPrice = Number(price);
    const numStock = Number(stock);
    if (!Number.isFinite(numPrice) || numPrice < 500) {
      res.status(400).json({ error: 'Harga layanan minimal Rp 500.' });
      return;
    }
    if (!Number.isInteger(numStock) || numStock < 0) {
      res.status(400).json({ error: 'Stok harus berupa angka 0 atau lebih.' });
      return;
    }

    const newService: NokosService = {
      id: `srv-${crypto.randomBytes(4).toString('hex')}`,
      appName: appName.trim().slice(0, 50),
      country: country.trim().slice(0, 50),
      countryCode: countryCode.trim().startsWith('+')
        ? countryCode.trim().slice(0, 8)
        : `+${countryCode.trim().slice(0, 7)}`,
      price: Math.round(numPrice),
      stock: numStock,
      estimatedTime: (estimatedTime || '1-5 Menit').trim().slice(0, 40),
      description: (description || '').trim().slice(0, 200),
      active: active !== false,
      providerProductCode: (providerProductCode || '').trim().slice(0, 40) || undefined,
      providerCountryCode: (providerCountryCode || '').trim().slice(0, 40) || undefined,
      updatedAt: new Date().toISOString(),
    };

    db.services.unshift(newService);
    saveDatabase(db);
    res.status(201).json({ service: newService, services: db.services });
  });

  app.put('/api/owner/services/:id', requirePrimaryOwner, (req, res) => {
    const service = db.services.find((s) => s.id === req.params.id);
    if (!service) {
      res.status(404).json({ error: 'Layanan tidak ditemukan.' });
      return;
    }

    const body = req.body as Partial<NokosService>;
    if (typeof body.appName === 'string' && body.appName.trim()) {
      service.appName = body.appName.trim().slice(0, 50);
    }
    if (typeof body.country === 'string' && body.country.trim()) {
      service.country = body.country.trim().slice(0, 50);
    }
    if (typeof body.countryCode === 'string' && body.countryCode.trim()) {
      const code = body.countryCode.trim();
      service.countryCode = code.startsWith('+') ? code.slice(0, 8) : `+${code.slice(0, 7)}`;
    }
    if (body.price !== undefined) {
      const p = Number(body.price);
      if (!Number.isFinite(p) || p < 500) {
        res.status(400).json({ error: 'Harga minimal Rp 500.' });
        return;
      }
      service.price = Math.round(p);
    }
    if (body.stock !== undefined) {
      const st = Number(body.stock);
      if (!Number.isInteger(st) || st < 0) {
        res.status(400).json({ error: 'Stok tidak valid.' });
        return;
      }
      service.stock = st;
    }
    if (typeof body.estimatedTime === 'string') {
      service.estimatedTime = body.estimatedTime.trim().slice(0, 40);
    }
    if (typeof body.description === 'string') {
      service.description = body.description.trim().slice(0, 200);
    }
    if (typeof body.providerProductCode === 'string') {
      service.providerProductCode = body.providerProductCode.trim().slice(0, 40) || undefined;
    }
    if (typeof body.providerCountryCode === 'string') {
      service.providerCountryCode = body.providerCountryCode.trim().slice(0, 40) || undefined;
    }
    if (typeof body.active === 'boolean') {
      service.active = body.active;
    }
    service.updatedAt = new Date().toISOString();

    saveDatabase(db);
    res.json({ service, services: db.services });
  });

  app.delete('/api/owner/services/:id', requirePrimaryOwner, (req, res) => {
    const idx = db.services.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Layanan tidak ditemukan.' });
      return;
    }
    db.services.splice(idx, 1);
    saveDatabase(db);
    res.json({ services: db.services });
  });

  // Owner verify / reject Top Up Saldo requests -> automatically credits user balance! (PRIMARY OWNER ONLY)
  app.patch('/api/owner/topups/:id', requirePrimaryOwner, (req, res) => {
    const topup = db.topups.find((t) => t.id === req.params.id);
    if (!topup) {
      res.status(404).json({ error: 'Permintaan isi saldo tidak ditemukan.' });
      return;
    }
    if (topup.status !== 'pending_verification') {
      res.status(400).json({ error: 'Permintaan isi saldo ini sudah diproses.' });
      return;
    }

    const { action, adminNote } = req.body as {
      action?: 'approve' | 'reject';
      adminNote?: string;
    };

    const user = db.users.find((u) => u.id === topup.userId);
    const now = new Date().toISOString();

    if (action === 'approve') {
      if (!user) {
        res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
        return;
      }
      topup.status = 'approved';
      topup.reviewedAt = now;
      topup.adminNote = (adminNote || '').trim().slice(0, 240) || null;

      const walletTx = recordWalletTransaction(
        user,
        'topup',
        topup.amount,
        `Isi saldo QRIS (${topup.id}) diverifikasi admin`,
        topup.id
      );

      saveDatabase(db);
      broadcastToOwners('topup:update', topup);
      broadcastToOwners('user:updated', toPublicUser(user));
      broadcastToUser(user.id, 'topup:update', topup);
      broadcastToUser(user.id, 'wallet:update', {
        balance: user.balance,
        transaction: walletTx,
      });

      res.json({ topup, user: toPublicUser(user), walletTransaction: walletTx });
      return;
    }

    if (action === 'reject') {
      const reason = (adminNote || '').trim().slice(0, 240);
      if (!reason) {
        res.status(400).json({ error: 'Berikan alasan penolakan isi saldo.' });
        return;
      }
      topup.status = 'rejected';
      topup.reviewedAt = now;
      topup.adminNote = reason;
      saveDatabase(db);
      broadcastToOwners('topup:update', topup);
      broadcastToUser(topup.userId, 'topup:update', topup);
      res.json({ topup });
      return;
    }

    res.status(400).json({ error: 'Aksi tidak dikenal.' });
  });

  // Owner manual order verification & delivery (PRIMARY OWNER ONLY)
  app.patch('/api/owner/orders/:id', requirePrimaryOwner, async (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    const { action, assignedNumber, otpCode, adminNote } = req.body as {
      action?: 'verify' | 'update_delivery' | 'complete' | 'reject';
      assignedNumber?: string;
      otpCode?: string;
      adminNote?: string;
    };

    const now = new Date().toISOString();

    if (action === 'verify') {
      const cleanNumber = (assignedNumber ?? order.assignedNumber ?? '').trim().slice(0, 40);
      const cleanOtp = (otpCode ?? order.otpCode ?? '').trim().slice(0, 20);
      const cleanNote = (adminNote ?? '').trim().slice(0, 240);

      const srv = db.services.find((s) => s.id === order.serviceId);
      if (order.status === 'pending_verification' || order.status === 'awaiting_payment') {
        if (srv && srv.stock > 0) {
          srv.stock = Math.max(0, srv.stock - order.quantity);
          srv.updatedAt = now;
        }
      }

      order.status = 'processing';
      order.verifiedAt = order.verifiedAt || now;
      if (cleanNumber) order.assignedNumber = cleanNumber;
      if (cleanOtp) order.otpCode = cleanOtp;
      if (cleanNote) order.adminNote = cleanNote;
      order.updatedAt = now;
      order.timeline.push({
        status: 'processing',
        label: cleanNumber
          ? 'Pembayaran diverifikasi admin & nomor disiapkan'
          : 'Pembayaran diverifikasi admin, nomor sedang disiapkan',
        timestamp: now,
        actor: 'Owner',
        note: cleanNote || (cleanNumber ? `Nomor: ${cleanNumber}` : undefined),
      });

      // If Owner didn't enter a manual number and an API provider is configured, fetch a real number
      if (!order.assignedNumber && db.settings.nokosProviderMode !== 'manual') {
        await provisionNumberFromProvider(order, srv, db.settings);
      }
    } else if (action === 'update_delivery') {
      const cleanNumber = (assignedNumber ?? '').trim().slice(0, 40);
      const cleanOtp = (otpCode ?? '').trim().slice(0, 20);
      const cleanNote = (adminNote ?? '').trim().slice(0, 240);

      if (cleanNumber) order.assignedNumber = cleanNumber;
      if (cleanOtp) order.otpCode = cleanOtp;
      if (adminNote !== undefined) order.adminNote = cleanNote || null;
      order.updatedAt = now;

      const updates: string[] = [];
      if (cleanNumber) updates.push(`Nomor: ${cleanNumber}`);
      if (cleanOtp) updates.push(`OTP: ${cleanOtp}`);

      order.timeline.push({
        status: order.status,
        label: 'Owner memperbarui data nomor / kode OTP',
        timestamp: now,
        actor: 'Owner',
        note: updates.join(' · ') || cleanNote || undefined,
      });
    } else if (action === 'complete') {
      const cleanNumber = (assignedNumber ?? order.assignedNumber ?? '').trim().slice(0, 40);
      const cleanOtp = (otpCode ?? order.otpCode ?? '').trim().slice(0, 20);
      const cleanNote = (adminNote ?? '').trim().slice(0, 240);

      if (!cleanNumber) {
        res.status(400).json({
          error: 'Masukkan Nomor Nokos yang diberikan sebelum menyelesaikan pesanan.',
        });
        return;
      }

      order.assignedNumber = cleanNumber;
      if (cleanOtp) order.otpCode = cleanOtp;
      if (cleanNote) order.adminNote = cleanNote;
      order.status = 'completed';
      order.verifiedAt = order.verifiedAt || now;
      order.completedAt = now;
      order.updatedAt = now;
      order.timeline.push({
        status: 'completed',
        label: 'Pesanan selesai — Nomor & OTP telah dikirim',
        timestamp: now,
        actor: 'Owner',
        note: cleanNote || `Nomor: ${cleanNumber}`,
      });
    } else if (action === 'reject') {
      const reason = (adminNote || '').trim().slice(0, 240);
      if (!reason) {
        res.status(400).json({ error: 'Berikan alasan penolakan agar pelanggan mengetahui.' });
        return;
      }

      // Refund balance if paid via user wallet balance
      if (
        order.paymentMethod === 'balance' &&
        order.userId &&
        order.status !== 'rejected'
      ) {
        const user = db.users.find((u) => u.id === order.userId);
        if (user) {
          const tx = recordWalletTransaction(
            user,
            'refund',
            order.totalAmount,
            `Pengembalian saldo dari pesanan ditolak (${order.id})`,
            order.id
          );
          broadcastToOwners('user:updated', toPublicUser(user));
          broadcastToUser(user.id, 'wallet:update', {
            balance: user.balance,
            transaction: tx,
          });
        }
      }

      order.status = 'rejected';
      order.adminNote = reason;
      order.updatedAt = now;
      order.timeline.push({
        status: 'rejected',
        label: 'Pesanan / pembayaran ditolak oleh admin',
        timestamp: now,
        actor: 'Owner',
        note: reason,
      });
    } else {
      res.status(400).json({ error: 'Aksi tidak dikenal.' });
      return;
    }

    saveDatabase(db);
    broadcastOrderUpdate(order);
    res.json({ order });
  });

  // Owner manual triggers against the real Nokos provider API (PRIMARY OWNER ONLY)
  app.post('/api/owner/orders/:id/provider-action', requirePrimaryOwner, async (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    const { action } = req.body as {
      action?: 'provision' | 'check_otp' | 'cancel_provider';
    };

    if (action === 'provision') {
      if (db.settings.nokosProviderMode === 'manual') {
        res.status(400).json({
          error: 'Mode provider saat ini Manual. Aktifkan 5sim atau SMS-Activate API di Pengaturan terlebih dahulu.',
        });
        return;
      }
      const srv = db.services.find((s) => s.id === order.serviceId);
      const ok = await provisionNumberFromProvider(order, srv, db.settings);
      saveDatabase(db);
      broadcastOrderUpdate(order);
      if (!ok) {
        res.status(400).json({ error: order.providerError || 'Gagal mengambil nomor dari provider.', order });
        return;
      }
      res.json({ order, message: `Nomor real ${order.assignedNumber} berhasil disiapkan.` });
      return;
    }

    if (action === 'check_otp') {
      const checkRes = await checkProviderOrderSms(order, db.settings);
      if (checkRes.updated) {
        saveDatabase(db);
        broadcastOrderUpdate(order);
      }
      res.json({ order, message: checkRes.message });
      return;
    }

    if (action === 'cancel_provider') {
      const cancelRes = await sendProviderStatusAction(order, db.settings, 'cancel');
      if (!cancelRes.ok) {
        res.status(400).json({ error: `Gagal membatalkan di provider: ${cancelRes.detail}` });
        return;
      }
      const now = new Date().toISOString();
      order.providerError = `Dibatalkan di provider (${cancelRes.detail})`;
      order.updatedAt = now;
      order.timeline.push({
        status: order.status,
        label: 'Aktivasi nomor dibatalkan di provider oleh Owner',
        timestamp: now,
        actor: 'Owner',
      });
      saveDatabase(db);
      broadcastOrderUpdate(order);
      res.json({ order, message: 'Aktivasi di provider berhasil dibatalkan.' });
      return;
    }

    res.status(400).json({ error: 'Aksi provider tidak dikenal.' });
  });

  // Owner Live Chat management (PRIMARY OWNER ONLY)
  app.post('/api/owner/chat/threads/:id/read', requirePrimaryOwner, (req, res) => {
    const thread = db.chatThreads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Obrolan tidak ditemukan.' });
      return;
    }
    const updatedIds = markThreadMessagesRead(thread, 'owner');
    res.json({ updatedIds, thread });
  });

  app.post('/api/owner/chat/threads/:id/messages', requirePrimaryOwner, (req, res) => {
    const thread = db.chatThreads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Obrolan tidak ditemukan.' });
      return;
    }
    if (thread.status === 'closed') {
      res.status(400).json({ error: 'Obrolan ini sudah ditutup.' });
      return;
    }

    const { text } = req.body as { text?: string };
    const cleanText = (text || '').trim().slice(0, 1000);
    if (!cleanText) {
      res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
      return;
    }

    // Mark unread customer messages as read by owner when replying
    markThreadMessagesRead(thread, 'owner');

    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: `msg-${crypto.randomBytes(4).toString('hex')}`,
      threadId: thread.id,
      senderRole: 'owner',
      senderName: 'RFABLNDO',
      text: cleanText,
      createdAt: now,
      readByOwner: true,
      readByCustomer: false,
      readAt: null,
    };

    thread.messages.push(msg);
    thread.updatedAt = now;
    saveDatabase(db);

    broadcastToOwners('chat:message', msg);
    broadcastToUser(thread.userId, 'chat:message', msg);

    res.status(201).json({ message: msg, thread });
  });

  app.post('/api/owner/chat/threads/:id/close', requirePrimaryOwner, (req, res) => {
    const thread = db.chatThreads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Obrolan tidak ditemukan.' });
      return;
    }
    if (thread.status === 'closed') {
      res.json({ thread });
      return;
    }

    markThreadMessagesRead(thread, 'owner');
    const now = new Date().toISOString();
    thread.status = 'closed';
    thread.closedAt = now;
    thread.closedBy = 'Owner';
    thread.updatedAt = now;
    saveDatabase(db);

    broadcastToOwners('chat:closed', thread);
    broadcastToUser(thread.userId, 'chat:closed', thread);

    res.json({ thread });
  });

  // Frontend serving (Vite middleware in dev, dist in prod)
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distIndex);

  if (isProd) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Create HTTP server & attach WebSocketServer on /ws
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const roleParam = url.searchParams.get('role') === 'owner' ? 'owner' : 'customer';
    const tokenParam = url.searchParams.get('token');
    const orderIdsParam = url.searchParams.get('orderIds') || '';

    let role: 'owner' | 'customer' = 'customer';
    let dashboardRole: DashboardRole | undefined;
    let rentalId: string | undefined;
    let sessionToken: string | undefined;
    let userId: string | undefined;

    if (roleParam === 'owner') {
      const auth = resolveDashboardAuth(tokenParam, req);
      if (!auth.valid) {
        appendSecurityLog(
          'warning',
          'UNAUTHORIZED_WS_PROBE',
          'Koneksi WebSocket dashboard tanpa token valid ditolak.',
          getClientIp(req),
          getClientUserAgent(req),
          false
        );
        ws.close(4001, 'Unauthorized owner');
        return;
      }
      role = 'owner';
      dashboardRole = auth.role;
      rentalId = auth.rental?.id;
      sessionToken = tokenParam || undefined;
    } else {
      const user = findUserByToken(tokenParam);
      if (user) {
        userId = user.id;
      }
    }

    const meta: ClientSocketMeta = {
      ws,
      role,
      dashboardRole,
      rentalId,
      sessionToken,
      userId,
      watchedOrderIds: new Set(
        orderIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    };
    wsClients.add(meta);

    sendWsMessage(ws, 'ws:connected', { role, dashboardRole: dashboardRole ?? null, userId: userId ?? null });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as {
          type?: string;
          orderIds?: string[];
          threadId?: string;
        };

        if (data.type === 'watch_orders' && Array.isArray(data.orderIds)) {
          for (const id of data.orderIds) {
            if (typeof id === 'string' && id.trim()) {
              meta.watchedOrderIds.add(id.trim());
            }
          }
        } else if (data.type === 'chat:read' && typeof data.threadId === 'string') {
          const thread = db.chatThreads.find((t) => t.id === data.threadId);
          if (thread) {
            if (meta.role === 'owner') {
              markThreadMessagesRead(thread, 'owner');
            } else if (meta.userId && thread.userId === meta.userId) {
              markThreadMessagesRead(thread, 'customer');
            }
          }
        }
      } catch {
        // Ignore malformed WS message
      }
    });

    ws.on('close', () => {
      wsClients.delete(meta);
    });
  });

  // Background live SMS OTP poller for active API-backed orders (real SMS only, never simulated)
  let isPollingOtps = false;
  setInterval(async () => {
    if (isPollingOtps) return;
    const activeOrders = db.orders.filter(
      (o) =>
        o.status === 'processing' &&
        o.providerActivationId !== null &&
        !o.otpCode &&
        o.providerMode !== 'manual' &&
        !o.providerError
    );
    if (activeOrders.length === 0) return;
    isPollingOtps = true;
    try {
      let anyUpdated = false;
      for (const order of activeOrders) {
        const res = await checkProviderOrderSms(order, db.settings);
        if (res.updated) {
          anyUpdated = true;
          broadcastOrderUpdate(order);
        }
      }
      if (anyUpdated) {
        saveDatabase(db);
      }
    } catch {
      // Ignore transient poll errors
    } finally {
      isPollingOtps = false;
    }
  }, 5000);

  // Background rental expiry + WIB schedule watcher (10s)
  setInterval(() => {
    try {
      syncExpiredRentals();
      syncStoreOperationState();
    } catch {
      // Ignore transient timer check error
    }
  }, 10_000);

  const port =
    process.env.NODE_ENV === 'production'
      ? Number(process.env.PORT) || 3000
      : 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`nokosrfablndo HTTP + WS server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
