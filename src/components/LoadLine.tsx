import { CRITERIA } from '@/lib/criteria';
import { BUDGET_TIER_LABELS, budgetTier } from '@/lib/evaluate';
import { euro } from '@/lib/format';
import type { BudgetTier } from '@/lib/types';

/** Bornes de l'échelle, en euros. */
const SCALE_MIN = 300;
const SCALE_MAX = 720;

const position = (value: number) =>
  Math.max(0, Math.min(100, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

const MARKER_TONE: Record<BudgetTier, string> = {
  ideal: 'bg-ok',
  correct: 'bg-accent',
  'dernier-recours': 'bg-warn',
  'hors-budget': 'bg-signal',
};

/**
 * Jauge de loyer, lue comme une ligne de charge sur une coque :
 * vert jusqu'au loyer idéal, ambre jusqu'au plafond, hachures rouges au-delà.
 * Le repère vertical situe le loyer charges comprises affiché sur l'annonce.
 */
export function LoadLine({ cost, showScale = false }: { cost?: number; showScale?: boolean }) {
  const ideal = position(CRITERIA.idealRent);
  const max = position(CRITERIA.maxRent);
  const tier = cost != null ? budgetTier(cost) : null;

  return (
    <div
      role="img"
      aria-label={
        cost != null && tier
          ? `Loyer de ${euro(cost)} charges comprises : ${BUDGET_TIER_LABELS[tier].toLowerCase()}`
          : `Échelle de loyer charges comprises : idéal jusqu'à ${euro(CRITERIA.idealRent)}, maximum ${euro(CRITERIA.maxRent)}`
      }
      className="select-none"
    >
      <div className="relative h-2.5">
        <div className="absolute inset-y-0 left-0 bg-ok/30" style={{ width: `${ideal}%` }} />
        <div
          className="absolute inset-y-0 bg-warn/35"
          style={{ left: `${ideal}%`, width: `${max - ideal}%` }}
        />
        <div className="loadline-over absolute inset-y-0 right-0 opacity-70" style={{ left: `${max}%` }} />
        {cost != null && tier ? (
          <div
            className={`absolute -inset-y-1 w-1 ${MARKER_TONE[tier]}`}
            style={{ left: `calc(${position(cost)}% - 2px)` }}
          />
        ) : null}
      </div>
      {showScale ? (
        <div className="relative mt-1.5 h-4 text-xs tabular-nums text-muted" aria-hidden>
          <span className="absolute -translate-x-1/2" style={{ left: `${ideal}%` }}>
            {CRITERIA.idealRent}
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: `${max}%` }}>
            {CRITERIA.maxRent}
          </span>
        </div>
      ) : null}
    </div>
  );
}
