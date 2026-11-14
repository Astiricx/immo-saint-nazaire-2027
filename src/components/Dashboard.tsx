'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useListingsFile } from '@/lib/data';
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
import type { Listing, StatusId } from '@/lib/types';
import { AddListingDialog } from './AddListingDialog';
import { Brief } from './Brief';
import { CollectionStatus } from './CollectionStatus';
import { FiltersBar, type View } from './FiltersBar';
import { Footer } from './Footer';
import { Header, type Tab } from './Header';
import { KanbanBoard } from './KanbanBoard';
import { ListingCard } from './ListingCard';
import { ListingDrawer } from './ListingDrawer';
import { ListingsTable } from './ListingsTable';
import { UnlockScreen } from './UnlockScreen';

interface Prefs {
  tab: Tab;
  view: View;
  sort: SortKey;
  filters: Filters;
}

const DEFAULT_PREFS: Prefs = {
  tab: 'annonces',
  view: 'grid',
  sort: 'score',
  filters: DEFAULT_FILTERS,
};

function revivePrefs(value: unknown): Prefs {
  if (!value || typeof value !== 'object') return DEFAULT_PREFS;
  const input = value as Partial<Prefs>;
  return {
    tab: input.tab === 'suivi' ? 'suivi' : 'annonces',
    view: input.view === 'table' ? 'table' : 'grid',
    sort: input.sort ?? DEFAULT_PREFS.sort,
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
  const { state: file, unlock } = useListingsFile();

  const collected = useMemo(
    () => (file.status === 'ready' ? file.data.listings.map((listing) => evaluate(listing)) : []),
    [file],
  );
  const all = useMemo(
    () => [...tracker.custom.map((listing) => evaluate(listing)), ...collected],
    [tracker.custom, collected],
  );
  // Le collecteur ne publie que des annonces conformes ; les ajouts manuels sont filtrés ici.
  const accepted = useMemo(() => all.filter((l) => l.accepted), [all]);

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
  const data = file.status === 'ready' ? file.data : null;

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
        {file.status === 'locked' ? (
          <UnlockScreen error={file.error} unlocking={file.unlocking} onUnlock={unlock} />
        ) : prefs.tab === 'annonces' ? (
          <>
            <Brief
              accepted={accepted.length}
              idealCount={idealCount}
              data={data}
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
              {file.status === 'loading' ? (
                <p className="flex items-center gap-2 py-12 text-muted" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Chargement des annonces
                </p>
              ) : file.status === 'error' && all.length === 0 ? (
                <div className="rounded-md border border-dashed border-line px-6 py-12 text-center">
                  <p className="font-medium">Les annonces n’ont pas pu être chargées.</p>
                  <p className="mt-1 text-sm text-muted">
                    Le fichier des annonces est introuvable ({file.message}). Rechargez la page ;
                    si le problème persiste, relancez la collecte depuis l’onglet Actions du dépôt.
                  </p>
                </div>
              ) : accepted.length === 0 ? (
                <div className="rounded-md border border-dashed border-line px-6 py-12 text-center">
                  <p className="font-medium">
                    {data?.generatedAt
                      ? 'Aucune annonce ne respecte vos critères pour le moment.'
                      : 'La première collecte n’a pas encore eu lieu.'}
                  </p>
                  <p className="mx-auto mt-1 max-w-xl text-sm text-muted">
                    La collecte repasse chaque matin. En attendant, ajoutez une annonce repérée
                    ailleurs : elle sera notée et suivie comme les autres.
                  </p>
                  <button type="button" className="btn btn-primary mt-4" onClick={() => setAdding(true)}>
                    Ajouter une annonce
                  </button>
                </div>
              ) : visible.length === 0 ? (
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

            {data ? <CollectionStatus data={data} /> : null}
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
