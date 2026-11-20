import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  ExternalLink,
  KeyRound,
  LogOut,
  QrCode,
  Send,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import type {
  PublicCustomerUser,
  PublicStoreSettings,
  TopUpRequest,
  WalletTransaction,
} from '../types';
import { fileToBase64, formatDateTime, formatRupiah } from '../utils/format';

interface CustomerAuthModalProps {
  user: PublicCustomerUser | null;
  topups: TopUpRequest[];
  transactions: WalletTransaction[];
  settings: PublicStoreSettings;
  userToken: string | null;
  initialMode?: 'login' | 'register' | 'wallet';
  onClose: () => void;
  onAuthenticated: (
    token: string,
    user: PublicCustomerUser,
    ownerToken?: string
  ) => Promise<void>;
  onUserUpdated?: (user: PublicCustomerUser) => void;
  onLogout: () => Promise<void>;
  onTopUpCreated: (topup: TopUpRequest) => void;
}

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000];

export function CustomerAuthModal({
  user,
  topups,
  transactions,
  settings,
  userToken,
  initialMode = 'login',
  onClose,
  onAuthenticated,
  onUserUpdated,
  onLogout,
  onTopUpCreated,
}: CustomerAuthModalProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recover'>(
    initialMode === 'register' ? 'register' : 'login'
  );
  const [walletTab, setWalletTab] = useState<'topup' | 'history' | 'account'>('topup');

  // Login / Register fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Recovery fields (Forgot Password & Username)
  const [recEmail, setRecEmail] = useState('');
  const [recWhatsapp, setRecWhatsapp] = useState('');
  const [recFoundUsername, setRecFoundUsername] = useState<string | null>(null);
  const [recNewPassword, setRecNewPassword] = useState('');
  const [recConfirmPassword, setRecConfirmPassword] = useState('');
  const [recError, setRecError] = useState<string | null>(null);
  const [recBusy, setRecBusy] = useState(false);

  // Logged-in Profile & Change Password fields
  const [editName, setEditName] = useState(user?.name || '');
  const [editWhatsapp, setEditWhatsapp] = useState(user?.whatsapp || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);
  const [passSaving, setPassSaving] = useState(false);

  // Top up fields
  const [amountInput, setAmountInput] = useState('25000');
  const [senderName, setSenderName] = useState(user?.name || '');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupSuccess, setTopupSuccess] = useState<string | null>(null);
  const [topupSubmitting, setTopupSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: PublicCustomerUser;
        ownerToken?: string;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Gagal masuk.');
      }
      await onAuthenticated(data.token, data.user, data.ownerToken);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (password.length < 6) {
      setAuthError('Kata sandi minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Ulangi sandi Anda tidak cocok.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          password,
          confirmPassword,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: PublicCustomerUser;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Gagal mendaftar.');
      }
      await onAuthenticated(data.token, data.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal mendaftar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoverLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError(null);
    setRecBusy(true);
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recEmail.trim(),
          whatsapp: recWhatsapp.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        username?: string;
        error?: string;
      };
      if (!res.ok || !data.username) {
        throw new Error(data.error || 'Akun tidak ditemukan.');
      }
      setRecFoundUsername(data.username);
    } catch (err) {
      setRecError(err instanceof Error ? err.message : 'Gagal memeriksa akun.');
    } finally {
      setRecBusy(false);
    }
  };

  const handleRecoverResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError(null);
    if (recNewPassword.length < 6) {
      setRecError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (recNewPassword !== recConfirmPassword) {
      setRecError('Ulangi sandi baru Anda tidak cocok.');
      return;
    }
    setRecBusy(true);
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recEmail.trim(),
          whatsapp: recWhatsapp.trim(),
          newPassword: recNewPassword,
          confirmPassword: recConfirmPassword,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: PublicCustomerUser;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Gagal memperbarui kata sandi.');
      }
      await onAuthenticated(data.token, data.user);
    } catch (err) {
      setRecError(err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.');
    } finally {
      setRecBusy(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToken) return;
    setProfileMsg(null);
    setProfileErr(null);
    setProfileSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          whatsapp: editWhatsapp.trim(),
        }),
      });
      const data = (await res.json()) as { user?: PublicCustomerUser; error?: string };
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Gagal memperbarui profil.');
      }
      onUserUpdated?.(data.user);
      setProfileMsg('Username & nomor aktif berhasil diperbarui.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToken) return;
    setPassMsg(null);
    setPassErr(null);
    if (newPass.length < 6) {
      setPassErr('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPass !== confirmNewPass) {
      setPassErr('Ulangi sandi baru Anda tidak cocok.');
      return;
    }
    setPassSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          currentPassword: currPass,
          newPassword: newPass,
          confirmPassword: confirmNewPass,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengganti kata sandi.');
      }
      setCurrPass('');
      setNewPass('');
      setConfirmNewPass('');
      setPassMsg('Kata sandi Anda berhasil diperbarui.');
    } catch (err) {
      setPassErr(err instanceof Error ? err.message : 'Gagal mengganti kata sandi.');
    } finally {
      setPassSaving(false);
    }
  };

  const handleSelectProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTopupError(null);
    try {
      const encoded = await fileToBase64(file);
      setProofFile(file);
      setProofPreview(encoded.dataBase64);
    } catch (err) {
      setTopupError(err instanceof Error ? err.message : 'File tidak valid.');
    }
  };

  const handleSubmitTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToken) return;
    setTopupError(null);
    setTopupSuccess(null);

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 5000) {
      setTopupError('Minimal isi saldo adalah Rp 5.000.');
      return;
    }
    if (!proofFile || !proofPreview) {
      setTopupError('Unggah screenshot bukti pembayaran QRIS terlebih dahulu.');
      return;
    }

    setTopupSubmitting(true);
    try {
      const res = await fetch('/api/wallet/topups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          amount,
          senderName: senderName.trim() || user?.name || '',
          dataBase64: proofPreview,
          mimeType: proofFile.type,
        }),
      });
      const data = (await res.json()) as { topup?: TopUpRequest; error?: string };
      if (!res.ok || !data.topup) {
        throw new Error(data.error || 'Gagal mengirim permintaan isi saldo.');
      }
      onTopUpCreated(data.topup);
      setProofFile(null);
      setProofPreview(null);
      setTopupSuccess(
        `Bukti isi saldo ${formatRupiah(data.topup.amount)} terkirim. Saldo otomatis masuk setelah diverifikasi Owner.`
      );
    } catch (err) {
      setTopupError(
        err instanceof Error ? err.message : 'Gagal mengirim isi saldo.'
      );
    } finally {
      setTopupSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">
            {user
              ? 'Akun & Saldo Pelanggan'
              : authMode === 'login'
                ? 'Masuk Akun Pelanggan'
                : authMode === 'register'
                  ? 'Daftar Akun Pelanggan'
                  : 'Pemulihan Akun & Kata Sandi'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!user ? (
            <div className="space-y-5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    authMode === 'login'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    authMode === 'register'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Daftar Baru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('recover');
                    setRecError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    authMode === 'recover'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lupa Sandi
                </button>
              </div>

              {authMode === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Gmail, Username, atau Nomor Aktif
                    </label>
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Masukkan Gmail, username, atau nomor aktif"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kata Sandi
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  {authError && <p className="text-xs text-rose-600">{authError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {submitting ? 'Memproses...' : 'Masuk ke Akun'}
                  </button>
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('recover');
                        setRecError(null);
                      }}
                      className="text-emerald-700 font-medium hover:underline"
                    >
                      Lupa kata sandi atau username?
                    </button>
                    {settings.ownerTelegram && (
                      <a
                        href={`https://t.me/${settings.ownerTelegram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"
                      >
                        <Send className="w-3 h-3" />
                        <span>@{settings.ownerTelegram}</span>
                      </a>
                    )}
                  </div>
                </form>
              ) : authMode === 'recover' ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Masukkan <strong>Gmail</strong> dan <strong>Nomor Aktif</strong> yang Anda gunakan saat mendaftar untuk melihat username dan mengatur ulang kata sandi.
                  </p>

                  {!recFoundUsername ? (
                    <form onSubmit={handleRecoverLookup} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Gmail Terdaftar
                        </label>
                        <input
                          type="email"
                          required
                          value={recEmail}
                          onChange={(e) => setRecEmail(e.target.value)}
                          placeholder="nama@gmail.com"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Nomor Aktif Terdaftar
                        </label>
                        <input
                          type="tel"
                          required
                          value={recWhatsapp}
                          onChange={(e) => setRecWhatsapp(e.target.value)}
                          placeholder="08xxxxxxxxxx"
                          className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                      {recError && <p className="text-xs text-rose-600">{recError}</p>}
                      <button
                        type="submit"
                        disabled={recBusy}
                        className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {recBusy ? 'Memeriksa...' : 'Cek Username & Reset Sandi'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRecoverResetPassword} className="space-y-3.5">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 space-y-0.5">
                        <p className="text-emerald-700">Akun ditemukan. Username Anda:</p>
                        <p className="text-sm font-bold">{recFoundUsername}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Kata Sandi Baru
                        </label>
                        <input
                          type="password"
                          required
                          value={recNewPassword}
                          onChange={(e) => setRecNewPassword(e.target.value)}
                          placeholder="Minimal 6 karakter"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Ulangi Sandi Baru Anda
                        </label>
                        <input
                          type="password"
                          required
                          value={recConfirmPassword}
                          onChange={(e) => setRecConfirmPassword(e.target.value)}
                          placeholder="Masukkan ulang kata sandi baru"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                      {recError && <p className="text-xs text-rose-600">{recError}</p>}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRecFoundUsername(null);
                            setRecNewPassword('');
                            setRecConfirmPassword('');
                          }}
                          className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          Ganti Data
                        </button>
                        <button
                          type="submit"
                          disabled={recBusy}
                          className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {recBusy ? 'Menyimpan...' : 'Simpan Sandi Baru & Masuk'}
                        </button>
                      </div>
                    </form>
                  )}

                  {settings.ownerTelegram && (
                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500">
                        Butuh bantuan langsung dari Owner?
                      </span>
                      <a
                        href={`https://t.me/${settings.ownerTelegram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                      >
                        <span>Telegram @{settings.ownerTelegram}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama atau Username
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Masukkan nama atau username"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Gmail
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@gmail.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nomor Aktif
                    </label>
                    <input
                      type="tel"
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kata Sandi
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Ulangi Sandi Anda
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Masukkan ulang kata sandi"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  {authError && <p className="text-xs text-rose-600">{authError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {submitting ? 'Mendaftar...' : 'Daftar & Masuk'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Account & Balance Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">
                    {user.email} · {user.whatsapp}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 inline-flex items-center gap-1 justify-end">
                    <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Saldo Akun</span>
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                    {formatRupiah(user.balance)}
                  </p>
                </div>
              </div>

              {/* Tabs: Isi Saldo | Riwayat Saldo | Akun & Sandi */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setWalletTab('topup')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    walletTab === 'topup'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Isi Saldo
                </button>
                <button
                  type="button"
                  onClick={() => setWalletTab('history')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    walletTab === 'history'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Riwayat ({transactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditName(user.name);
                    setEditWhatsapp(user.whatsapp);
                    setWalletTab('account');
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    walletTab === 'account'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Akun & Sandi
                </button>
              </div>

              {walletTab === 'topup' ? (
                <form onSubmit={handleSubmitTopUp} className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Nominal Isi Saldo (IDR)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAmountInput(String(amt))}
                          className={`py-2 px-2 text-xs font-mono font-semibold rounded-lg border transition-colors ${
                            Number(amountInput) === amt
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {amt / 1000}rb
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={5000}
                      step={1000}
                      required
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  {settings.qrisImageUrl ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-center space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {settings.qrisMerchantName}
                        </span>
                        <a
                          href={settings.qrisImageUrl}
                          download={`QRIS-${settings.qrisMerchantName}.png`}
                          className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" /> Simpan QRIS
                        </a>
                      </div>
                      <img
                        src={settings.qrisImageUrl}
                        alt="QRIS Owner"
                        referrerPolicy="no-referrer"
                        className="w-44 h-44 mx-auto object-contain bg-white border border-slate-200 rounded-lg p-2"
                      />
                      <p className="text-xs text-slate-600">
                        Transfer tepat{' '}
                        <span className="font-mono font-semibold text-slate-900">
                          {formatRupiah(Number(amountInput) || 0)}
                        </span>
                        , lalu unggah bukti bayar di bawah. Saldo otomatis masuk setelah diverifikasi Owner.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2">
                      <QrCode className="w-4 h-4 shrink-0" />
                      <span>
                        Foto QRIS belum diunggah oleh Owner. Isi saldo tersedia setelah Owner mengunggah QRIS.
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Pengirim / E-Wallet / Bank
                    </label>
                    <input
                      type="text"
                      required
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Nama pengirim / e-wallet / bank"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Bukti Transfer QRIS
                    </label>
                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-emerald-600 text-xs font-medium text-slate-700">
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span className="truncate">
                        {proofFile ? proofFile.name : 'Pilih foto bukti bayar (PNG/JPG)'}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleSelectProof}
                        className="sr-only"
                      />
                    </label>
                    {proofPreview && (
                      <img
                        src={proofPreview}
                        alt="Preview bukti top up"
                        className="mt-2 h-28 w-auto mx-auto object-contain rounded-lg border border-slate-200 p-1"
                      />
                    )}
                  </div>

                  {topupError && (
                    <p className="text-xs text-rose-600">{topupError}</p>
                  )}
                  {topupSuccess && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                      {topupSuccess}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={topupSubmitting || !settings.qrisImageUrl}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {topupSubmitting
                      ? 'Mengirim Bukti...'
                      : 'Kirim Bukti Isi Saldo'}
                  </button>

                  {topups.length > 0 && (
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Status Permintaan Isi Saldo Terbaru
                      </p>
                      <div className="space-y-1.5">
                        {topups.slice(0, 4).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-slate-50 rounded-lg border border-slate-200"
                          >
                            <div>
                              <span className="font-mono font-semibold text-slate-900">
                                {formatRupiah(t.amount)}
                              </span>
                              <span className="text-slate-500 ml-2">
                                {formatDateTime(t.createdAt)}
                              </span>
                            </div>
                            <span
                              className={`font-medium ${
                                t.status === 'approved'
                                  ? 'text-emerald-700'
                                  : t.status === 'rejected'
                                    ? 'text-rose-600'
                                    : 'text-blue-700'
                              }`}
                            >
                              {t.status === 'approved'
                                ? 'Masuk Saldo'
                                : t.status === 'rejected'
                                  ? 'Ditolak'
                                  : 'Menunggu Verifikasi'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </form>
              ) : walletTab === 'history' ? (
                <div className="space-y-2">
                  {transactions.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">
                      Belum ada riwayat transaksi saldo.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                      {transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="p-3 flex items-center justify-between gap-3 text-xs bg-white"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            {tx.amount >= 0 ? (
                              <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">
                                {tx.description}
                              </p>
                              <p className="text-slate-500 font-mono tabular-nums">
                                {formatDateTime(tx.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={`font-mono font-semibold tabular-nums ${
                                tx.amount >= 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {tx.amount >= 0 ? '+' : ''}
                              {formatRupiah(tx.amount)}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                              Saldo {formatRupiah(tx.balanceAfter)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">ID Akun Permanen</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {user.id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Terdaftar Sejak</span>
                      <span className="font-mono text-slate-700 tabular-nums">
                        {formatDateTime(user.createdAt)}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-900">
                      Ubah Username & Nomor Aktif
                    </h3>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama atau Username
                      </label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nomor Aktif
                      </label>
                      <input
                        type="tel"
                        required
                        value={editWhatsapp}
                        onChange={(e) => setEditWhatsapp(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    {profileErr && <p className="text-xs text-rose-600">{profileErr}</p>}
                    {profileMsg && (
                      <p className="text-xs text-emerald-700">{profileMsg}</p>
                    )}
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {profileSaving ? 'Menyimpan...' : 'Simpan Profil'}
                    </button>
                  </form>

                  <form
                    onSubmit={handleChangeOwnPassword}
                    className="pt-4 border-t border-slate-200 space-y-3"
                  >
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                      <span>Ganti Kata Sandi</span>
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
                    <input
                      type="password"
                      required
                      value={confirmNewPass}
                      onChange={(e) => setConfirmNewPass(e.target.value)}
                      placeholder="Ulangi sandi baru Anda"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    {passErr && <p className="text-xs text-rose-600">{passErr}</p>}
                    {passMsg && <p className="text-xs text-emerald-700">{passMsg}</p>}
                    <button
                      type="submit"
                      disabled={passSaving}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {passSaving ? 'Memperbarui...' : 'Perbarui Kata Sandi'}
                    </button>
                  </form>

                  {settings.ownerTelegram && (
                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Telegram Resmi Owner</span>
                      <a
                        href={`https://t.me/${settings.ownerTelegram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>@{settings.ownerTelegram}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar Akun</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
