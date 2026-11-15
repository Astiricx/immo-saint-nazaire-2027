'use client';

import { Bike, CalendarCheck, FileText } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { euro, formatDate, formatSurface, typeLabel } from '@/lib/format';
import { STATUSES } from '@/lib/pipeline';
import type { TrackEntry } from '@/lib/storage';
import type { EvaluatedListing, StatusId } from '@/lib/types';
import { STATUS_ICONS, StatusSelect } from './ui';

const EMPTY_HINTS: Record<StatusId, string> = {
  'a-analyser': 'Tout est trié.',
  contacte: 'Déposez ici les annonces dont vous avez contacté le bailleur.',
  visite: 'Déposez ici les annonces avec une visite fixée.',
  dossier: 'Déposez ici les annonces pour lesquelles le dossier est parti.',
  refuse: 'Les annonces abandonnées ou refusées arrivent ici.',
  'coup-de-coeur': 'Gardez ici vos annonces favorites.',
};

/** Suivi des annonces par étape : glisser-déposer à la souris, liste déroulante au tactile et au clavier. */
export function KanbanBoard({
  listings,
  entryOf,
  onStatus,
  onOpen,
}: {
  listings: EvaluatedListing[];
  entryOf: (id: string) => TrackEntry;
  onStatus: (id: string, status: StatusId) => void;
  onOpen: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<StatusId | null>(null);

  const columns = useMemo(() => {
    const grouped = new Map<StatusId, EvaluatedListing[]>();
    for (const status of STATUSES) grouped.set(status.id, []);
    for (const listing of [...listings].sort((a, b) => b.score - a.score)) {
      grouped.get(entryOf(listing.id).status)?.push(listing);
    }
    return grouped;
  }, [listings, entryOf]);

  const handleDrop = (event: DragEvent<HTMLElement>, status: StatusId) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || draggedId;
    if (id) onStatus(id, status);
    setDraggedId(null);
    setOverStatus(null);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-3 py-6 md:grid-cols-3 xl:grid-cols-6">
      {STATUSES.map((status) => {
        const Icon = STATUS_ICONS[status.id];
        const items = columns.get(status.id) ?? [];
        const isOver = overStatus === status.id && draggedId !== null;
        return (
          <section
            key={status.id}
            aria-label={`${status.label} : ${items.length} annonce${items.length > 1 ? 's' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (overStatus !== status.id) setOverStatus(status.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOverStatus(null);
              }
            }}
            onDrop={(event) => handleDrop(event, status.id)}
            className={`flex min-w-0 flex-col rounded-md border transition-colors ${
              isOver ? 'border-accent bg-accent/10' : 'border-line bg-surface-2'
            }`}
          >
            <header className="border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Icon
                  className={`size-4 shrink-0 ${status.id === 'coup-de-coeur' ? 'text-signal' : 'text-muted'}`}
                  aria-hidden
                />
                <h2 className="font-medium">{status.label}</h2>
                <span className="ml-auto font-display text-xl font-semibold leading-none tabular-nums">
                  {items.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{status.hint}</p>
            </header>

            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2 md:max-h-[68vh] md:overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-1 py-2 text-sm leading-relaxed text-muted">{EMPTY_HINTS[status.id]}</p>
              ) : (
                items.map((l) => {
                  const entry = entryOf(l.id);
                  return (
                    <article
                      key={l.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', l.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggedId(l.id);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setOverStatus(null);
                      }}
                      className={`cursor-grab rounded-md border border-line bg-surface p-3 active:cursor-grabbing ${
                        draggedId === l.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span>
                          <span className="font-display text-2xl font-semibold leading-none tabular-nums">
                            {euro(l.monthlyCost)}
                          </span>
                          <span className="ml-1.5 text-sm tabular-nums text-accent">
                            net {euro(l.netCost)}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums text-muted" title="Score de pertinence">
                          {l.score} sur 100
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-medium leading-snug">
                        <button
                          type="button"
                          onClick={() => onOpen(l.id)}
                          className="text-left hover:underline"
                        >
                          {typeLabel(l.type)} de {formatSurface(l.surface)}, {l.districtName}
                        </button>
                      </h3>
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                        <Bike className="size-4 shrink-0" aria-hidden />
                        {l.bikeMinutes != null ? `${l.bikeMinutes} min` : 'Trajet à vérifier'}
                      </p>
                      {entry.visitDate ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm">
                          <CalendarCheck className="size-4 shrink-0 text-accent" aria-hidden />
                          Visite le {formatDate(entry.visitDate)}
                        </p>
                      ) : null}
                      {entry.notes ? (
                        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
                          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
                          <span className="line-clamp-2">{entry.notes}</span>
                        </p>
                      ) : null}
                      <StatusSelect
                        value={entry.status}
                        onChange={(next) => onStatus(l.id, next)}
                        className="mt-2.5 py-1"
                      />
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
