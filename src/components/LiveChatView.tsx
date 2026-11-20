import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Lock,
  MessageSquarePlus,
  Send,
  Star,
  X,
} from 'lucide-react';
import type { ChatThread, NokosOrder, PublicCustomerUser } from '../types';
import { formatDateTime } from '../utils/format';

interface LiveChatViewProps {
  user: PublicCustomerUser | null;
  userToken: string | null;
  threads: ChatThread[];
  orders: NokosOrder[];
  prefillOrderId: string | null;
  compact?: boolean;
  onCloseFloating?: () => void;
  onClearPrefillOrder: () => void;
  onRequireAuth: () => void;
  onThreadCreated: (thread: ChatThread) => void;
  onThreadUpdated: (thread: ChatThread) => void;
  onMessagesReadByCustomer: (threadId: string) => void;
}

const OWNER_NAME = 'RFABLNDO';
const OWNER_AVATAR_URL =
  '/assets/aistudio/file_000000002cf4820787354e496d9bf8db_a88dfc17.png';

export function LiveChatView({
  user,
  userToken,
  threads,
  orders,
  prefillOrderId,
  compact = false,
  onCloseFloating,
  onClearPrefillOrder,
  onRequireAuth,
  onThreadCreated,
  onThreadUpdated,
  onMessagesReadByCustomer,
}: LiveChatViewProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    threads[0]?.id || null
  );
  const [composingNew, setComposingNew] = useState<boolean>(
    Boolean(prefillOrderId) || threads.length === 0
  );
  const [compactShowList, setCompactShowList] = useState<boolean>(false);

  // New thread form (only ID Pesanan & message — no example text)
  const [orderIdInput, setOrderIdInput] = useState<string>(prefillOrderId || '');
  const [initialMessage, setInitialMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Rating / review state when closed
  const [ratingValue, setRatingValue] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefillOrderId) {
      setOrderIdInput(prefillOrderId);
      setComposingNew(true);
      setCompactShowList(false);
      onClearPrefillOrder();
    }
  }, [prefillOrderId, onClearPrefillOrder]);

  useEffect(() => {
    if (!composingNew && !selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [threads, selectedThreadId, composingNew]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  // Mark owner messages as read when customer views an active thread
  useEffect(() => {
    if (!activeThread || !userToken || composingNew || compactShowList) return;
    const hasUnreadFromOwner = activeThread.messages.some(
      (m) => m.senderRole === 'owner' && !m.readByCustomer
    );
    if (hasUnreadFromOwner) {
      onMessagesReadByCustomer(activeThread.id);
      void fetch(`/api/chat/threads/${encodeURIComponent(activeThread.id)}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
      });
    }
  }, [activeThread, userToken, composingNew, compactShowList, onMessagesReadByCustomer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length, composingNew]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialMessage.trim()) {
      setCreateError('Tulis pesan terlebih dahulu.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const cleanId = orderIdInput.trim().toUpperCase();
      const res = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          orderId: cleanId || null,
          subject: cleanId || '',
          initialMessage: initialMessage.trim(),
        }),
      });
      const data = (await res.json()) as { thread?: ChatThread; error?: string };
      if (!res.ok || !data.thread) {
        throw new Error(data.error || 'Gagal memulai obrolan.');
      }
      onThreadCreated(data.thread);
      setSelectedThreadId(data.thread.id);
      setComposingNew(false);
      setCompactShowList(false);
      setInitialMessage('');
      setOrderIdInput('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Gagal memulai obrolan.');
    } finally {
      setCreating(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !replyText.trim()) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(activeThread.id)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({ text: replyText.trim() }),
        }
      );
      const data = (await res.json()) as { thread?: ChatThread; error?: string };
      if (!res.ok || !data.thread) {
        throw new Error(data.error || 'Gagal mengirim pesan.');
      }
      onThreadUpdated(data.thread);
      setReplyText('');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(activeThread.id)}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            rating: ratingValue,
            review: reviewText.trim(),
          }),
        }
      );
      const data = (await res.json()) as { thread?: ChatThread; error?: string };
      if (!res.ok || !data.thread) {
        throw new Error(data.error || 'Gagal mengirim ulasan.');
      }
      onThreadUpdated(data.thread);
      setReviewText('');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Gagal mengirim ulasan.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Auth Gate
  if (!user || !userToken) {
    return (
      <div className={compact ? 'flex flex-col h-full bg-white' : 'max-w-lg mx-auto py-12'}>
        <div
          className={
            compact
              ? 'px-4 py-3 border-b border-slate-200 grid grid-cols-3 items-center bg-slate-50'
              : 'hidden'
          }
        >
          <span className="text-xs font-mono text-slate-500">Live Chat</span>
          <div className="flex items-center justify-center gap-2">
            <img
              src={OWNER_AVATAR_URL}
              alt={OWNER_NAME}
              className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-500/40 shrink-0"
            />
            <p className="text-sm font-bold text-slate-900">{OWNER_NAME}</p>
          </div>
          <div className="flex justify-end">
            {onCloseFloating && (
              <button
                type="button"
                onClick={onCloseFloating}
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70"
                aria-label="Tutup obrolan"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div
          className={
            compact
              ? 'flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4'
              : 'bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4'
          }
        >
          <img
            src={OWNER_AVATAR_URL}
            alt={OWNER_NAME}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-emerald-500/40 shadow-sm mx-auto"
          />
          <p className="text-lg font-bold text-slate-900">{OWNER_NAME}</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Masuk atau daftar akun pelanggan untuk menghubungi {OWNER_NAME} terkait pesanan Anda.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Masuk / Daftar Akun
          </button>
        </div>
      </div>
    );
  }

  // Shared Compose Form (No Contoh, only Order ID & message)
  const renderComposeForm = () => (
    <form onSubmit={handleCreateThread} className="p-4 sm:p-5 space-y-3.5 flex-1 overflow-y-auto">
      {orders.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            ID Pesanan
          </label>
          <select
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Tanpa ID Pesanan</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          ID Pesanan (Opsional)
        </label>
        <input
          type="text"
          value={orderIdInput}
          onChange={(e) => setOrderIdInput(e.target.value)}
          placeholder="Masukkan ID pesanan"
          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Pesan
        </label>
        <textarea
          rows={compact ? 3 : 4}
          required
          value={initialMessage}
          onChange={(e) => setInitialMessage(e.target.value)}
          placeholder="Tulis pesan..."
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
      </div>

      {createError && <p className="text-xs text-rose-600">{createError}</p>}

      <div className="flex items-center justify-end gap-2.5 pt-1">
        {threads.length > 0 && (
          <button
            type="button"
            onClick={() => setComposingNew(false)}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Batal
          </button>
        )}
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{creating ? 'Mengirim...' : 'Kirim'}</span>
        </button>
      </div>
    </form>
  );

  // Shared Thread List (ID + Status only)
  const renderThreadList = () =>
    threads.length === 0 ? (
      <div className="p-6 text-center text-xs text-slate-500">
        Belum ada obrolan.
      </div>
    ) : (
      <div className="divide-y divide-slate-200 overflow-y-auto flex-1">
        {threads.map((t) => {
          const isSelected = !composingNew && selectedThreadId === t.id;
          const lastMsg = t.messages[t.messages.length - 1];
          const unreadOwnerMsgs = t.messages.filter(
            (m) => m.senderRole === 'owner' && !m.readByCustomer
          ).length;
          const displayId = t.orderId || t.id;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedThreadId(t.id);
                setComposingNew(false);
                setCompactShowList(false);
              }}
              className={`w-full text-left p-3.5 transition-colors ${
                isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono font-bold text-slate-900 truncate">
                  {displayId}
                </p>
                <span
                  className={`text-[11px] font-medium shrink-0 ${
                    t.status === 'open' ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {t.status === 'open' ? 'Terbuka' : 'Ditutup'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <img
                  src={OWNER_AVATAR_URL}
                  alt={OWNER_NAME}
                  className="w-4 h-4 rounded-full object-cover shrink-0"
                />
                <p className="text-xs font-semibold text-slate-700">{OWNER_NAME}</p>
              </div>
              {lastMsg && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{lastMsg.text}</p>
              )}
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-400">
                <span className="font-mono tabular-nums">
                  {formatDateTime(t.updatedAt)}
                </span>
                {unreadOwnerMsgs > 0 && (
                  <span className="font-semibold text-emerald-700">
                    {unreadOwnerMsgs} baru
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );

  // Shared Active Messages + Reply/Rating Footer
  const renderActiveThreadBody = () => {
    if (!activeThread) return null;
    return (
      <>
        <div
          className={`flex-1 p-4 space-y-3 overflow-y-auto bg-slate-50/40 ${
            compact ? 'min-h-0' : 'max-h-[380px]'
          }`}
        >
          {activeThread.messages.map((msg) => {
            const isMine = msg.senderRole === 'customer';
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm space-y-1 ${
                    isMine
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-900'
                  }`}
                >
                  {!isMine && (
                    <div className="flex items-center gap-1.5">
                      <img
                        src={OWNER_AVATAR_URL}
                        alt={OWNER_NAME}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                      <p className="text-[11px] font-bold text-emerald-700">
                        {OWNER_NAME}
                      </p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                    {msg.text}
                  </p>
                  <div
                    className={`flex items-center justify-end gap-1.5 text-[10px] ${
                      isMine ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    <span className="font-mono tabular-nums">
                      {formatDateTime(msg.createdAt)}
                    </span>
                    {isMine &&
                      (msg.readByOwner ? (
                        <CheckCheck
                          className="w-3.5 h-3.5 text-sky-400 shrink-0"
                          aria-label="Sudah dilihat Owner"
                        />
                      ) : (
                        <Check
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          aria-label="Terkirim, belum dilihat Owner"
                        />
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {activeThread.status === 'open' ? (
          <form
            onSubmit={handleSendReply}
            className="p-3 border-t border-slate-200 bg-white space-y-1.5 shrink-0"
          >
            {replyError && <p className="text-xs text-rose-600">{replyError}</p>}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Tulis pesan..."
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3.5 border-t border-slate-200 bg-slate-50 space-y-3 shrink-0 max-h-[230px] overflow-y-auto">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Obrolan ditutup oleh {OWNER_NAME}.</span>
            </div>

            {activeThread.rating === null ? (
              <form
                onSubmit={handleSubmitReview}
                className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5"
              >
                <p className="text-xs font-bold text-slate-900">
                  Beri Rating & Ulasan ({OWNER_NAME})
                </p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingValue(star)}
                      className="p-0.5 rounded hover:bg-slate-100 transition-colors"
                      aria-label={`Beri ${star} bintang`}
                    >
                      <Star
                        className={`w-5 h-5 ${
                          star <= ratingValue
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-1.5 text-xs font-semibold text-slate-700">
                    {ratingValue}/5
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Tulis ulasan..."
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {reviewError && <p className="text-xs text-rose-600">{reviewError}</p>}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setComposingNew(true)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    + Obrolan Baru
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {submittingReview ? 'Menyimpan...' : 'Kirim Ulasan'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-white border border-emerald-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= (activeThread.rating || 0)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  {activeThread.review && (
                    <p className="text-xs text-slate-600">
                      &ldquo;{activeThread.review}&rdquo;
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setComposingNew(true)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Obrolan Baru
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  // COMPACT FLOATING MODE
  if (compact) {
    const activeDisplayId = activeThread ? activeThread.orderId || activeThread.id : 'Baru';

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Centered Header: ID on left, RFABLNDO in middle, actions on right */}
        <div className="px-3.5 py-2.5 border-b border-slate-200 grid grid-cols-3 items-center bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {!compactShowList && threads.length > 0 && (
              <button
                type="button"
                onClick={() => setCompactShowList(true)}
                className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200/60 shrink-0"
                aria-label="Daftar obrolan"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="text-[11px] font-mono font-semibold text-slate-700 truncate">
              {compactShowList ? 'Obrolan' : composingNew ? 'Baru' : activeDisplayId}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 min-w-0">
            <img
              src={OWNER_AVATAR_URL}
              alt={OWNER_NAME}
              className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-500/40 shrink-0"
            />
            <p className="text-sm font-extrabold tracking-tight text-slate-900 truncate">
              {OWNER_NAME}
            </p>
          </div>

          <div className="flex items-center justify-end gap-1">
            {!composingNew && (
              <button
                type="button"
                onClick={() => {
                  setComposingNew(true);
                  setCompactShowList(false);
                }}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-md"
                aria-label="Obrolan baru"
                title="Obrolan Baru"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </button>
            )}
            {onCloseFloating && (
              <button
                type="button"
                onClick={onCloseFloating}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-md"
                aria-label="Tutup obrolan"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {compactShowList
          ? renderThreadList()
          : composingNew || !activeThread
            ? renderComposeForm()
            : renderActiveThreadBody()}
      </div>
    );
  }

  // FULL PAGE MODE
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <img
            src={OWNER_AVATAR_URL}
            alt={OWNER_NAME}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/40 shrink-0"
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Chat</h1>
            <p className="text-sm text-slate-600 font-mono">{OWNER_NAME}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setComposingNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>Obrolan Baru</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[520px]">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
            <p className="text-xs font-semibold text-slate-700">
              Obrolan ({threads.length})
            </p>
          </div>
          {renderThreadList()}
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-[520px]">
          {/* Chat Window Header with RFABLNDO centered */}
          <div className="px-5 py-3.5 border-b border-slate-200 grid grid-cols-3 items-center bg-slate-50/70">
            <span className="text-xs font-mono font-semibold text-slate-700 truncate">
              {composingNew || !activeThread
                ? 'Obrolan Baru'
                : activeThread.orderId || activeThread.id}
            </span>
            <div className="flex items-center justify-center gap-2 min-w-0">
              <img
                src={OWNER_AVATAR_URL}
                alt={OWNER_NAME}
                className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-500/40 shrink-0"
              />
              <p className="text-sm font-extrabold tracking-tight text-slate-900 truncate">
                {OWNER_NAME}
              </p>
            </div>
            <span className="text-[11px] text-slate-500 text-right">
              {!composingNew && activeThread
                ? activeThread.status === 'open'
                  ? 'Terbuka'
                  : 'Ditutup'
                : ''}
            </span>
          </div>

          {composingNew || !activeThread
            ? renderComposeForm()
            : renderActiveThreadBody()}
        </div>
      </div>
    </div>
  );
}
