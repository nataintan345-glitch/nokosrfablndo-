import { useMemo, useState } from 'react';
import type { ChatThread, NokosOrder, PublicCustomerUser, TopUpRequest } from '../types';
import { formatRupiah } from '../utils/format';

interface OwnerAnalyticsChartsProps {
  orders: NokosOrder[];
  topups: TopUpRequest[];
  users: PublicCustomerUser[];
  chatThreads: ChatThread[];
}

type ChartRangeDays = 7 | 14 | 30;

interface DailyBucket {
  dateKey: string;
  labelShort: string;
  labelFull: string;
  revenue: number;
  orderCount: number;
  completedCount: number;
  newUsers: number;
}

function getLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatCompactRupiah(val: number): string {
  if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}jt`;
  if (val >= 1_000) return `Rp ${Math.round(val / 1_000)}rb`;
  return `Rp ${val}`;
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${midX} ${p0.y.toFixed(1)}, ${midX} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export function OwnerAnalyticsCharts({
  orders,
  topups,
  users,
  chatThreads,
}: OwnerAnalyticsChartsProps) {
  const [rangeDays, setRangeDays] = useState<ChartRangeDays>(7);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [hoveredStatusKey, setHoveredStatusKey] = useState<string | null>(null);

  const summary = useMemo(() => {
    let verifiedRevenue = 0;
    let verifiedOrdersCount = 0;
    let pendingVerify = 0;
    let processing = 0;
    let completed = 0;
    let awaiting = 0;
    let rejected = 0;
    let paidBalanceAmount = 0;
    let paidQrisAmount = 0;

    for (const o of orders) {
      if (o.status === 'pending_verification') pendingVerify++;
      if (o.status === 'processing') {
        processing++;
        verifiedRevenue += o.totalAmount;
        verifiedOrdersCount++;
      } else if (o.status === 'completed') {
        completed++;
        verifiedRevenue += o.totalAmount;
        verifiedOrdersCount++;
      } else if (o.status === 'awaiting_payment') {
        awaiting++;
      } else if (o.status === 'rejected') {
        rejected++;
      }

      if (o.status === 'processing' || o.status === 'completed') {
        if (o.paymentMethod === 'balance') paidBalanceAmount += o.totalAmount;
        else paidQrisAmount += o.totalAmount;
      }
    }

    const totalUserBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    const pendingTopups = topups.filter((t) => t.status === 'pending_verification').length;
    const approvedTopupVolume = topups
      .filter((t) => t.status === 'approved')
      .reduce((s, t) => s + t.amount, 0);

    const ratedThreads = chatThreads.filter((t) => t.rating !== null);
    const avgRating =
      ratedThreads.length > 0
        ? (
            ratedThreads.reduce((s, t) => s + (t.rating || 0), 0) / ratedThreads.length
          ).toFixed(1)
        : null;

    return {
      verifiedRevenue,
      verifiedOrdersCount,
      pendingVerify,
      processing,
      completed,
      awaiting,
      rejected,
      paidBalanceAmount,
      paidQrisAmount,
      totalUserBalance,
      pendingTopups,
      approvedTopupVolume,
      avgRating,
      ratedCount: ratedThreads.length,
    };
  }, [orders, topups, users, chatThreads]);

  const dailyBuckets = useMemo<DailyBucket[]>(() => {
    const today = new Date();
    const buckets: DailyBucket[] = [];
    const byKey = new Map<string, DailyBucket>();

    const shortFmt = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
    });
    const fullFmt = new Intl.DateTimeFormat('id-ID', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    for (let offset = rangeDays - 1; offset >= 0; offset--) {
      const d = new Date(today);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const bucket: DailyBucket = {
        dateKey,
        labelShort: shortFmt.format(d),
        labelFull: fullFmt.format(d),
        revenue: 0,
        orderCount: 0,
        completedCount: 0,
        newUsers: 0,
      };
      buckets.push(bucket);
      byKey.set(dateKey, bucket);
    }

    for (const o of orders) {
      const key = getLocalDateKey(o.createdAt);
      const bucket = byKey.get(key);
      if (!bucket) continue;
      bucket.orderCount += 1;
      if (o.status === 'processing' || o.status === 'completed') {
        bucket.revenue += o.totalAmount;
      }
      if (o.status === 'completed') {
        bucket.completedCount += 1;
      }
    }

    for (const u of users) {
      const key = getLocalDateKey(u.createdAt);
      const bucket = byKey.get(key);
      if (bucket) bucket.newUsers += 1;
    }

    return buckets;
  }, [orders, users, rangeDays]);

  const topApps = useMemo(() => {
    const map = new Map<string, { appName: string; count: number; revenue: number }>();
    for (const o of orders) {
      if (o.status === 'rejected') continue;
      const existing = map.get(o.appName) || {
        appName: o.appName,
        count: 0,
        revenue: 0,
      };
      existing.count += o.quantity;
      if (o.status === 'processing' || o.status === 'completed') {
        existing.revenue += o.totalAmount;
      }
      map.set(o.appName, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 5);
  }, [orders]);

  // SVG Area/Bar chart coordinates
  const chartW = 720;
  const chartH = 250;
  const padL = 62;
  const padR = 20;
  const padT = 22;
  const padB = 34;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxRevenue = Math.max(
    10000,
    ...dailyBuckets.map((b) => b.revenue)
  );
  const maxOrderCount = Math.max(1, ...dailyBuckets.map((b) => b.orderCount));

  const points = dailyBuckets.map((b, i) => {
    const stepX = dailyBuckets.length > 1 ? plotW / (dailyBuckets.length - 1) : plotW / 2;
    const x = dailyBuckets.length > 1 ? padL + i * stepX : padL + plotW / 2;
    const y = padT + plotH - (b.revenue / maxRevenue) * plotH;
    return { x, y, bucket: b };
  });

  const linePath = buildSmoothPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  const rangeRevenueTotal = dailyBuckets.reduce((s, b) => s + b.revenue, 0);
  const rangeOrderTotal = dailyBuckets.reduce((s, b) => s + b.orderCount, 0);
  const activeDay =
    hoveredDayIdx !== null && dailyBuckets[hoveredDayIdx]
      ? dailyBuckets[hoveredDayIdx]
      : null;

  // Donut Chart geometry
  const totalOrdersAll = orders.length;
  const statusSegments = [
    {
      key: 'completed',
      label: 'Selesai',
      count: summary.completed,
      color: '#059669',
    },
    {
      key: 'processing',
      label: 'Diproses',
      count: summary.processing,
      color: '#0f172a',
    },
    {
      key: 'pending_verification',
      label: 'Perlu Verifikasi',
      count: summary.pendingVerify,
      color: '#2563eb',
    },
    {
      key: 'awaiting_payment',
      label: 'Belum Bayar',
      count: summary.awaiting,
      color: '#d97706',
    },
    {
      key: 'rejected',
      label: 'Ditolak',
      count: summary.rejected,
      color: '#e11d48',
    },
  ];

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let runningOffset = 0;

  return (
    <div className="space-y-6">
      {/* 4-Column Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Pendapatan Terverifikasi
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatRupiah(summary.verifiedRevenue)}
          </p>
          <p className="text-xs text-emerald-700 font-medium tabular-nums">
            {summary.verifiedOrdersCount} pesanan lunas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Akun Pengguna Permanen
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {users.length}
          </p>
          <p className="text-xs text-slate-600 font-mono tabular-nums">
            Total saldo {formatRupiah(summary.totalUserBalance)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Antrean Verifikasi & Proses
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-blue-700">
            {summary.pendingVerify + summary.processing}
          </p>
          <p className="text-xs text-slate-600 tabular-nums">
            {summary.pendingVerify} verifikasi · {summary.processing} diproses
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Isi Saldo & Ulasan Chat
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatRupiah(summary.approvedTopupVolume)}
          </p>
          <p className="text-xs text-slate-600 tabular-nums">
            {summary.pendingTopups} top-up menunggu ·{' '}
            {summary.avgRating ? `Rating ${summary.avgRating}/5` : 'Belum ada rating'}
          </p>
        </div>
      </div>

      {/* Main Analytics Row: Revenue Trend Chart (8 cols) + Order Status Donut (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Interactive Revenue & Volume Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Grafik Pendapatan & Volume Pesanan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {activeDay ? (
                  <>
                    <span className="font-semibold text-slate-800">
                      {activeDay.labelFull}
                    </span>{' '}
                    · Pendapatan{' '}
                    <span className="font-mono font-semibold text-emerald-700">
                      {formatRupiah(activeDay.revenue)}
                    </span>{' '}
                    · {activeDay.orderCount} pesanan · {activeDay.newUsers} user baru
                  </>
                ) : (
                  <>
                    Total {rangeDays} hari terakhir:{' '}
                    <span className="font-mono font-semibold text-emerald-700">
                      {formatRupiah(rangeRevenueTotal)}
                    </span>{' '}
                    dari {rangeOrderTotal} pesanan
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto shrink-0">
              {([7, 14, 30] as ChartRangeDays[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setRangeDays(d);
                    setHoveredDayIdx(null);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    rangeDays === d
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d} Hari
                </button>
              ))}
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-56 sm:h-64 select-none"
              role="img"
              aria-label="Grafik pendapatan dan pesanan harian"
            >
              <defs>
                <linearGradient id="nokosRevAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y-Axis Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padT + plotH - ratio * plotH;
                const val = Math.round(maxRevenue * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={chartW - padR}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={ratio === 0 ? undefined : '4 4'}
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {formatCompactRupiah(val)}
                    </text>
                  </g>
                );
              })}

              {/* Subtle Daily Order Count Bars */}
              {points.map((pt, idx) => {
                const barWidth = Math.max(
                  6,
                  Math.min(20, (plotW / Math.max(1, dailyBuckets.length)) * 0.42)
                );
                const barH = (pt.bucket.orderCount / maxOrderCount) * (plotH * 0.42);
                const isHovered = hoveredDayIdx === idx;
                return (
                  <rect
                    key={`bar-${pt.bucket.dateKey}`}
                    x={pt.x - barWidth / 2}
                    y={padT + plotH - barH}
                    width={barWidth}
                    height={Math.max(0, barH)}
                    rx="3"
                    fill={isHovered ? '#0f172a' : '#e2e8f0'}
                    opacity={isHovered ? 0.28 : 0.75}
                  />
                );
              })}

              {/* Smooth Revenue Area & Curve */}
              {areaPath && <path d={areaPath} fill="url(#nokosRevAreaGrad)" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#059669"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Hover Guide Line + Data Nodes */}
              {points.map((pt, idx) => {
                const isHovered = hoveredDayIdx === idx;
                const showLabel =
                  rangeDays === 7 ||
                  idx === 0 ||
                  idx === points.length - 1 ||
                  idx % (rangeDays === 14 ? 2 : 5) === 0;
                const hitWidth =
                  dailyBuckets.length > 1
                    ? plotW / dailyBuckets.length
                    : plotW;
                return (
                  <g
                    key={pt.bucket.dateKey}
                    onMouseEnter={() => setHoveredDayIdx(idx)}
                    onMouseLeave={() => setHoveredDayIdx(null)}
                    onClick={() => setHoveredDayIdx(idx)}
                    className="cursor-pointer"
                  >
                    {isHovered && (
                      <line
                        x1={pt.x}
                        y1={padT}
                        x2={pt.x}
                        y2={padT + plotH}
                        stroke="#94a3b8"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5 : 3}
                      fill={isHovered ? '#059669' : '#ffffff'}
                      stroke="#059669"
                      strokeWidth="2"
                    />
                    {showLabel && (
                      <text
                        x={pt.x}
                        y={chartH - 10}
                        textAnchor="middle"
                        className={`text-[10px] font-mono ${
                          isHovered ? 'fill-slate-900 font-semibold' : 'fill-slate-400'
                        }`}
                      >
                        {pt.bucket.labelShort}
                      </text>
                    )}
                    <rect
                      x={pt.x - hitWidth / 2}
                      y={padT}
                      width={hitWidth}
                      height={plotH + padB}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-600 inline-block" />
                <span>Pendapatan Harian</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-200 rounded-sm inline-block" />
                <span>Volume Pesanan</span>
              </span>
            </div>
            <span className="font-mono tabular-nums">
              Sentuh / arahkan kursor pada grafik untuk rincian tanggal
            </span>
          </div>
        </div>

        {/* Status Distribution Donut Chart */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Distribusi Status Pesanan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Proporsi seluruh transaksi yang tercatat
            </p>
          </div>

          <div className="flex items-center justify-center py-2">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="16"
                />
                {totalOrdersAll > 0 &&
                  statusSegments.map((seg) => {
                    if (seg.count === 0) return null;
                    const segLength = (seg.count / totalOrdersAll) * circumference;
                    const dashOffset = -runningOffset;
                    runningOffset += segLength;
                    const isHovered = hoveredStatusKey === seg.key;
                    return (
                      <circle
                        key={seg.key}
                        cx="70"
                        cy="70"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isHovered ? 19 : 16}
                        strokeDasharray={`${segLength} ${circumference - segLength}`}
                        strokeDashoffset={dashOffset}
                        onMouseEnter={() => setHoveredStatusKey(seg.key)}
                        onMouseLeave={() => setHoveredStatusKey(null)}
                        className="transition-all duration-150 cursor-pointer"
                      />
                    );
                  })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {totalOrdersAll}
                </span>
                <span className="text-[11px] text-slate-500">Total Order</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            {statusSegments.map((seg) => {
              const pct =
                totalOrdersAll > 0
                  ? Math.round((seg.count / totalOrdersAll) * 100)
                  : 0;
              return (
                <div
                  key={seg.key}
                  onMouseEnter={() => setHoveredStatusKey(seg.key)}
                  onMouseLeave={() => setHoveredStatusKey(null)}
                  className="flex items-center justify-between text-xs py-0.5 cursor-default"
                >
                  <div className="flex items-center gap-2 text-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span>{seg.label}</span>
                  </div>
                  <div className="font-mono tabular-nums text-slate-900">
                    <span className="font-semibold">{seg.count}</span>
                    <span className="text-slate-400 ml-1.5">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Secondary Analytics Row: Top Services + Payment Method Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Layanan Nokos Paling Diminati
            </h3>
            <span className="text-xs text-slate-500">Berdasarkan unit terjual</span>
          </div>

          {topApps.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Grafik layanan terlaris akan tampil setelah ada pesanan masuk.
            </p>
          ) : (
            <div className="space-y-3">
              {topApps.map((app) => {
                const maxQty = topApps[0].count || 1;
                const widthPct = Math.max(6, Math.round((app.count / maxQty) * 100));
                return (
                  <div key={app.appName} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">
                        {app.appName}
                      </span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {app.count} unit ·{' '}
                        <strong className="text-slate-900">
                          {formatRupiah(app.revenue)}
                        </strong>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Komposisi Metode Pembayaran
            </h3>
            <span className="text-xs text-slate-500">Pesanan lunas</span>
          </div>

          {summary.verifiedRevenue === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Belum ada pembayaran terverifikasi untuk ditampilkan.
            </p>
          ) : (
            <div className="space-y-4">
              {(() => {
                const totalPaid = summary.paidQrisAmount + summary.paidBalanceAmount;
                const qrisPct =
                  totalPaid > 0
                    ? Math.round((summary.paidQrisAmount / totalPaid) * 100)
                    : 0;
                const balancePct = totalPaid > 0 ? 100 - qrisPct : 0;
                return (
                  <>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                      {qrisPct > 0 && (
                        <div
                          className="h-full bg-slate-900"
                          style={{ width: `${qrisPct}%` }}
                        />
                      )}
                      {balancePct > 0 && (
                        <div
                          className="h-full bg-emerald-600"
                          style={{ width: `${balancePct}%` }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-900" />
                          <span>QRIS Owner</span>
                        </div>
                        <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                          {formatRupiah(summary.paidQrisAmount)}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          {qrisPct}% porsi
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                          <span>Saldo Akun</span>
                        </div>
                        <p className="text-base font-bold font-mono tabular-nums text-emerald-700">
                          {formatRupiah(summary.paidBalanceAmount)}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          {balancePct}% porsi
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
