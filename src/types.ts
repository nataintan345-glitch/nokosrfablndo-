export type OrderStatus =
  | 'awaiting_payment'
  | 'pending_verification'
  | 'processing'
  | 'completed'
  | 'rejected';

export type OrderPaymentMethod = 'qris' | 'balance';

export type TopUpStatus = 'pending_verification' | 'approved' | 'rejected';

export type WhatsAppMode = 'direct' | 'fonnte' | 'webhook';

export type NokosProviderMode = 'manual' | 'fivesim' | 'sms_activate';

export interface NokosService {
  id: string;
  appName: string;
  country: string;
  countryCode: string;
  price: number;
  stock: number;
  estimatedTime: string;
  description: string;
  active: boolean;
  providerProductCode?: string;
  providerCountryCode?: string;
  updatedAt: string;
}

export interface PublicStoreSettings {
  storeName: string;
  ownerWhatsapp: string;
  ownerTelegram: string;
  qrisImageUrl: string | null;
  qrisMerchantName: string;
  paymentInstruction: string;
  whatsappMode: WhatsAppMode;
}

export interface OwnerSettings extends PublicStoreSettings {
  whatsappApiToken: string;
  whatsappWebhookUrl: string;
  notifyOnNewOrder: boolean;
  notifyOnPaymentProof: boolean;
  nokosProviderMode: NokosProviderMode;
  nokosApiKey: string;
  nokosBaseUrl: string;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  label: string;
  timestamp: string;
  actor: 'Pelanggan' | 'Owner' | 'Sistem';
  note?: string;
}

export interface WhatsAppNotifLog {
  timestamp: string;
  event: 'order_created' | 'proof_uploaded' | 'topup_uploaded' | 'manual_test';
  mode: WhatsAppMode;
  success: boolean;
  detail: string;
}

export interface NokosOrder {
  id: string;
  userId: string | null;
  serviceId: string;
  appName: string;
  country: string;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: OrderPaymentMethod;
  customerName: string;
  customerWhatsapp: string;
  customerNote: string;
  status: OrderStatus;
  paymentProofUrl: string | null;
  paymentSenderName: string | null;
  assignedNumber: string | null;
  otpCode: string | null;
  otpSmsText: string | null;
  providerActivationId: string | null;
  providerMode: NokosProviderMode;
  providerError: string | null;
  adminNote: string | null;
  whatsappNotifLog: WhatsAppNotifLog[];
  timeline: OrderTimelineEntry[];
  createdAt: string;
  paidAt: string | null;
  verifiedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface PublicCustomerUser {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  balance: number;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'topup' | 'order_payment' | 'refund' | 'admin_adjustment';
  amount: number; // positive for credit, negative for debit
  balanceAfter: number;
  description: string;
  referenceId: string | null;
  createdAt: string;
}

export interface TopUpRequest {
  id: string;
  userId: string;
  userName: string;
  userWhatsapp: string;
  amount: number;
  senderName: string;
  proofUrl: string;
  status: TopUpStatus;
  adminNote: string | null;
  whatsappNotifLog: WhatsAppNotifLog[];
  createdAt: string;
  reviewedAt: string | null;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderRole: 'customer' | 'owner';
  senderName: string;
  text: string;
  createdAt: string;
  readByOwner: boolean;
  readByCustomer: boolean;
  readAt: string | null;
}

export interface ChatThread {
  id: string;
  userId: string;
  userName: string;
  userWhatsapp: string;
  orderId: string | null;
  subject: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  closedBy: 'Owner' | null;
  rating: number | null;
  review: string | null;
  ratedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type BroadcastPriority = 'info' | 'important' | 'urgent';

export interface BroadcastAnnouncement {
  id: string;
  title: string;
  message: string;
  priority: BroadcastPriority;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DashboardRole = 'owner' | 'tenant';

export type RentalStatus = 'active' | 'expired' | 'suspended';

export interface PublicRentalAccount {
  id: string;
  tenantName: string;
  username: string;
  tenantWhatsapp: string;
  durationDays: number;
  priceAmount: number;
  note: string;
  status: RentalStatus;
  startedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface RentalControlSettings {
  webLockMode: boolean;
  lockMessage: string;
}

export interface PublicRentalLockState {
  locked: boolean;
  reason: string;
  expiresAt: string | null;
  activeTenantName: string | null;
}

export type SecurityLogLevel = 'info' | 'warning' | 'critical';

export interface SecurityAuditLog {
  id: string;
  level: SecurityLogLevel;
  event: string;
  detail: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

export interface PublicOwnerSession {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export type StoreOperationMode = 'open' | 'close' | 'maintenance';

export type WeekdayCode = 'Sen' | 'Sel' | 'Rab' | 'Kam' | 'Jum' | 'Sab' | 'Min';

export interface StoreOperationSettings {
  mode: StoreOperationMode;
  autoBySchedule: boolean;
  openDays: WeekdayCode[];
  openTime: string;
  closeTime: string;
  openDescription: string;
  closeDescription: string;
  maintenanceDescription: string;
  updatedAt: string;
}

export interface PublicStoreOperationState extends StoreOperationSettings {
  effectiveMode: StoreOperationMode;
  scheduleSummary: string;
  activeDescription: string;
}

export interface PublicBootstrapResponse {
  settings: PublicStoreSettings;
  services: NokosService[];
  broadcasts: BroadcastAnnouncement[];
  ownerInitialized: boolean;
  rentalLock: PublicRentalLockState;
  operation: PublicStoreOperationState;
}

export type TenantOrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export interface TenantWorkspaceService {
  id: string;
  appName: string;
  country: string;
  countryCode: string;
  price: number;
  stock: number;
  estimatedTime: string;
  active: boolean;
  updatedAt: string;
}

export interface TenantWorkspaceOrder {
  id: string;
  customerName: string;
  customerContact: string;
  appName: string;
  country: string;
  quantity: number;
  totalAmount: number;
  assignedNumber: string;
  otpCode: string;
  note: string;
  status: TenantOrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantWorkspaceData {
  storeTitle: string;
  whatsapp: string;
  telegram: string;
  qrisMerchantName: string;
  qrisImageUrl: string | null;
  paymentInstruction: string;
  services: TenantWorkspaceService[];
  orders: TenantWorkspaceOrder[];
  updatedAt: string;
}

export interface OwnerBootstrapResponse {
  role: DashboardRole;
  rentalInfo: PublicRentalAccount | null;
  tenantWorkspace?: TenantWorkspaceData;
  ownerEmail?: string;
  settings?: OwnerSettings;
  services?: NokosService[];
  orders?: NokosOrder[];
  topups?: TopUpRequest[];
  users?: PublicCustomerUser[];
  walletTransactions?: WalletTransaction[];
  chatThreads?: ChatThread[];
  broadcasts?: BroadcastAnnouncement[];
  storeOperation?: StoreOperationSettings;
  effectiveOperation?: PublicStoreOperationState;
  rentals?: PublicRentalAccount[];
  rentalControl?: RentalControlSettings;
  securityLogs?: SecurityAuditLog[];
  activeOwnerSessions?: PublicOwnerSession[];
}

