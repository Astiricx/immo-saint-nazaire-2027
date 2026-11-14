'use client';

import { useCallback, useMemo, useState } from 'react';
import rawData from '@/data/listings.json';
import { evaluate } from '@/lib/evaluate';
import {
  DEFAULT_FILTERS,
  applyFilters,
  sortListings,
  type Filters,
  type SortKey,
} from '@/lib/filters';
import { DEFAULT_STATUS } from '@/lib/pipeline';
import {
  DEFAULT_ENTRY,
  EMPTY_TRACKER,
  STORAGE_KEYS,
  reviveTracker,
  useStoredState,
  type TrackEntry,
  type TrackerState,
} from '@/lib/storage';
import type { EvaluatedListing, Listing, ListingsFile, StatusId } from '@/lib/types';
import { AddListingDialog } from './AddListingDialog';
import { Brief } from './Brief';
import { FiltersBar, type View } from './FiltersBar';
import { Footer } from './Footer';
import { Header, type Tab } from './Header';
import { KanbanBoard } from './KanbanBoard';
import { ListingCard } from './ListingCard';
import { ListingDrawer } from './ListingDrawer';
import { ListingsTable } from './ListingsTable';
import { RejectedPanel } from './RejectedPanel';

const DATA = rawData as unknown as ListingsFile;
/** Les annonces collectées par le script, évaluées une fois pour toutes. */
const COLLECTED: EvaluatedListing[] = DATA.listings.map((listing) => evaluate(listing));

interface Prefs {
  tab: Tab;
  view: View;
  sort: SortKey;
  filters: Filters;
  demoNoticeDismissed: boolean;
}

const DEFAULT_PREFS: Prefs = {
  tab: 'annonces',
  view: 'grid',
  sort: 'score',
  filters: DEFAULT_FILTERS,
  demoNoticeDismissed: false,
};

function revivePrefs(value: unknown): Prefs {
  if (!value || typeof value !== 'object') return DEFAULT_PREFS;
  const input = value as Partial<Prefs>;
  return {
    ...DEFAULT_PREFS,
    ...input,
    filters: { ...DEFAULT_FILTERS, ...(input.filters ?? {}) },
  };
}

export function Dashboard() {
  const [tracker, setTracker] = useStoredState<TrackerState>(
    STORAGE_KEYS.tracker,
    EMPTY_TRACKER,
    reviveTracker,
  );
  const [prefs, setPrefs] = useStoredState<Prefs>(STORAGE_KEYS.prefs, DEFAULT_PREFS, revivePrefs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const all = useMemo(
    () => [...tracker.custom.map((listing) => evaluate(listing)), ...COLLECTED],
    [tracker.custom],
  );
  const accepted = useMemo(() => all.filter((l) => l.accepted), [all]);
  const rejected = useMemo(() => all.filter((l) => !l.accepted), [all]);

  const entryOf = useCallback(
    (id: string): TrackEntry => tracker.entries[id] ?? DEFAULT_ENTRY,
    [tracker.entries],
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<TrackEntry>) => {
      setTracker((previous) => ({
        ...previous,
        entries: {
          ...previous.entries,
          [id]: {
            ...DEFAULT_ENTRY,
            ...previous.entries[id],
            ...patch,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    },
    [setTracker],
  );

  const setStatus = useCallback(
    (id: string, status: StatusId) => updateEntry(id, { status }),
    [updateEntry],
  );

  const addListing = (listing: Listing) => {
    setTracker((previous) => ({ ...previous, custom: [listing, ...previous.custom] }));
    // Une annonce ajoutée doit être visible tout de suite, quel que soit son quartier.
    setPrefs((previous) => ({
      ...previous,
      tab: 'annonces',
      filters: { ...DEFAULT_FILTERS, zone: 'all' },
    }));
    setAdding(false);
    setSelectedId(listing.id);
  };

  const deleteListing = (id: string) => {
    setTracker((previous) => {
      const entries = { ...previous.entries };
      delete entries[id];
      return { ...previous, entries, custom: previous.custom.filter((l) => l.id !== id) };
    });
    setSelectedId(null);
  };

  const visible = useMemo(
    () =>
      sortListings(
        applyFilters(accepted, prefs.filters, (id) => entryOf(id).status),
        prefs.sort,
      ),
    [accepted, prefs.filters, prefs.sort, entryOf],
  );

  const trackedCount = accepted.filter((l) => entryOf(l.id).status !== DEFAULT_STATUS).length;
  const idealCount = accepted.filter((l) => l.budgetTier === 'ideal').length;
  const selected = selectedId ? (all.find((l) => l.id === selectedId) ?? null) : null;
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const closeDialog = useCallback(() => setAdding(false), []);
  const hasDemo = all.some((l) => l.isDemo);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        tab={prefs.tab}
        onTab={(tab) => setPrefs((previous) => ({ ...previous, tab }))}
        listingCount={accepted.length}
        trackedCount={trackedCount}
        onAdd={() => setAdding(true)}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 sm:px-6">
        {prefs.tab === 'annonces' ? (
          <>
            <Brief
              accepted={accepted.length}
              collected={all.length}
              rejected={rejected.length}
              idealCount={idealCount}
              generatedAt={DATA.generatedAt}
              showDemoNotice={hasDemo && !prefs.demoNoticeDismissed}
              onDismissDemoNotice={() =>
                setPrefs((previous) => ({ ...previous, demoNoticeDismissed: true }))
              }
            />

            <FiltersBar
              filters={prefs.filters}
              onFilters={(filters) => setPrefs((previous) => ({ ...previous, filters }))}
              sort={prefs.sort}
              onSort={(sort) => setPrefs((previous) => ({ ...previous, sort }))}
              view={prefs.view}
              onView={(view) => setPrefs((previous) => ({ ...previous, view }))}
              resultCount={visible.length}
              totalCount={accepted.length}
            />

            <div className="mt-4">
              {visible.length === 0 ? (
                <div className="rounded-md border border-dashed border-line px-6 py-12 text-center">
                  <p className="font-medium">Aucune annonce ne correspond à ces filtres.</p>
                  <p className="mt-1 text-sm text-muted">
                    Élargissez le secteur à tous les quartiers ou relevez le loyer maximum.
                  </p>
                  <button
                    type="button"
                    className="btn mt-4"
                    onClick={() =>
                      setPrefs((previous) => ({ ...previous, filters: DEFAULT_FILTERS }))
                    }
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : prefs.view === 'grid' ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      entry={entryOf(listing.id)}
                      onOpen={() => setSelectedId(listing.id)}
                      onStatus={(status) => setStatus(listing.id, status)}
                    />
                  ))}
                </div>
              ) : (
                <ListingsTable
                  listings={visible}
                  entryOf={entryOf}
                  sort={prefs.sort}
                  onSort={(sort) => setPrefs((previous) => ({ ...previous, sort }))}
                  onOpen={setSelectedId}
                  onStatus={setStatus}
                />
              )}
            </div>

            <RejectedPanel
              rejected={rejected}
              duplicatesRemoved={DATA.duplicatesRemoved}
              onOpen={setSelectedId}
            />
          </>
        ) : (
          <>
            <section className="pt-8">
              <h1 className="font-display text-4xl font-semibold leading-[1.05]">Suivi des démarches</h1>
              <p className="mt-2 max-w-2xl text-muted">
                Faites glisser une annonce d’une colonne à l’autre, ou changez son étape avec la
                liste déroulante. Ouvrez-la pour noter un contact ou une date de visite.
              </p>
            </section>
            <KanbanBoard
              listings={accepted}
              entryOf={entryOf}
              onStatus={setStatus}
              onOpen={setSelectedId}
            />
          </>
        )}
      </main>

      <Footer tracker={tracker} onImport={setTracker} />

      {selected ? (
        <ListingDrawer
          listing={selected}
          entry={entryOf(selected.id)}
          onClose={closeDrawer}
          onUpdate={(patch) => updateEntry(selected.id, patch)}
          onDelete={selected.source === 'manuel' ? () => deleteListing(selected.id) : undefined}
        />
      ) : null}
      {adding ? <AddListingDialog onClose={closeDialog} onAdd={addListing} /> : null}
    </div>
  );
}
