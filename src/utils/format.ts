import type { OrderStatus } from '../types';

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function normalizePhoneDisplay(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function buildWaUrl(phone: string, text: string): string {
  const target = normalizePhoneDisplay(phone);
  const encoded = encodeURIComponent(text);
  if (!target) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${target}?text=${encoded}`;
}

export function fileToBase64(file: File): Promise<{ dataBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      reject(new Error('Format file harus PNG, JPG, atau WEBP.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Ukuran gambar maksimal 5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Gagal membaca file gambar.'));
        return;
      }
      resolve({
        dataBase64: reader.result,
        mimeType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
      });
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export function getStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_payment':
      return 'Menunggu Pembayaran';
    case 'pending_verification':
      return 'Menunggu Verifikasi';
    case 'processing':
      return 'Diproses Admin';
    case 'completed':
      return 'Selesai';
    case 'rejected':
      return 'Ditolak';
  }
}

export function playNotificationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(660, now);
    osc1.frequency.setValueAtTime(880, now + 0.12);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);
  } catch {
    // Ignore audio context restriction
  }
}
