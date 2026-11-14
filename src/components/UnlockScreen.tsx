'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

/** Saisie de la phrase secrète qui déchiffre les annonces publiées. */
export function UnlockScreen({
  error,
  unlocking,
  onUnlock,
}: {
  error?: string;
  unlocking?: boolean;
  onUnlock: (passphrase: string, remember: boolean) => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [remember, setRemember] = useState(true);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passphrase.trim()) onUnlock(passphrase.trim(), remember);
  };

  return (
    <section className="mx-auto max-w-md py-16">
      <KeyRound className="size-8 text-accent" aria-hidden />
      <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05]">Annonces chiffrées</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Les annonces collectées ne sont lisibles qu’avec votre phrase secrète : celle que vous avez
        enregistrée dans le secret LISTINGS_PASSPHRASE du dépôt.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-3">
        <label htmlFor="phrase-secrete" className="label">
          Phrase secrète
        </label>
        <input
          id="phrase-secrete"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          className="field"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'phrase-erreur' : undefined}
        />
        {error ? (
          <p id="phrase-erreur" className="text-sm text-signal" role="alert">
            {error}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="size-4 accent-accent"
          />
          Se souvenir sur cet appareil
        </label>
        <button type="submit" className="btn btn-primary mt-1 justify-self-start" disabled={unlocking}>
          {unlocking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Déverrouiller
        </button>
      </form>
    </section>
  );
}
