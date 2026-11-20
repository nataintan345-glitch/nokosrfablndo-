import { CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import type { OrderStatus } from '../types';
import { getStatusLabel } from '../utils/format';

interface StatusLabelProps {
  status: OrderStatus;
}

export function StatusLabel({ status }: StatusLabelProps) {
  const label = getStatusLabel(status);

  switch (status) {
    case 'awaiting_payment':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'pending_verification':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
  }
}
