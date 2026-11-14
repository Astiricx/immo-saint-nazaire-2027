'use client';

import {
  Ban,
  CalendarCheck,
  ExternalLink,
  Heart,
  Inbox,
  MessageCircle,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { BUDGET_TIER_LABELS } from '@/lib/evaluate';
import { STATUSES } from '@/lib/pipeline';
import { linkLabel } from '@/lib/sources';
import type { BudgetTier, EvaluatedListing, StatusId } from '@/lib/types';

export const STATUS_ICONS: Record<StatusId, LucideIcon> = {
  'a-analyser': Inbox,
  contacte: MessageCircle,
  visite: CalendarCheck,
  dossier: Send,
  refuse: Ban,
  'coup-de-coeur': Heart,
};

export function ScoreBadge({ score, large = false }: { score: number; large?: boolean }) {
  const tone = score >= 75 ? 'text-ok' : score >= 55 ? 'text-accent' : 'text-muted';
  return (
    <div className="shrink-0 text-right" title="Score de pertinence sur 100">
      <span
        className={`block font-display font-semibold leading-none tabular-nums ${tone} ${
          large ? 'text-5xl' : 'text-3xl'
        }`}
      >
        {score}
      </span>
      <span className="mt-0.5 block text-xs leading-tight text-muted">sur 100</span>
    </div>
  );
}

const TIER_DOT: Record<BudgetTier, string> = {
  ideal: 'bg-ok',
  correct: 'bg-accent',
  'dernier-recours': 'bg-warn',
  'hors-budget': 'bg-signal',
};

export function TierTag({ tier }: { tier: BudgetTier }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
      <span className={`size-2 shrink-0 rounded-full ${TIER_DOT[tier]}`} aria-hidden />
      {BUDGET_TIER_LABELS[tier]}
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
  className = '',
  id,
}: {
  value: StatusId;
  onChange: (status: StatusId) => void;
  className?: string;
  /** À fournir quand un <label> visible pointe sur la liste. */
  id?: string;
}) {
  return (
    <select
      id={id}
      aria-label={id ? undefined : 'Étape du suivi'}
      value={value}
      onChange={(event) => onChange(event.target.value as StatusId)}
      className={`field ${className}`}
    >
      {STATUSES.map((status) => (
        <option key={status.id} value={status.id}>
          {status.label}
        </option>
      ))}
    </select>
  );
}

/** Lien vers l'annonce ; rien n'est rendu si l'adresse n'est pas une URL http(s). */
export function ListingLink({
  listing,
  className = 'btn',
  iconOnly = false,
}: {
  listing: EvaluatedListing;
  className?: string;
  iconOnly?: boolean;
}) {
  if (!/^https?:\/\//i.test(listing.url)) return null;
  const label = linkLabel(listing);
  return (
    <a
      href={listing.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={iconOnly ? `${label} (nouvel onglet)` : undefined}
      title={iconOnly ? label : undefined}
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden />
      {iconOnly ? null : label}
    </a>
  );
}

/** Ferme un panneau avec Échap et bloque le défilement de la page tant qu'il est ouvert. */
export function useOverlay(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
}
