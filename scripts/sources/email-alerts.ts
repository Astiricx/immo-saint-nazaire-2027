import type { RawListing } from '../../src/lib/types';
import { extractFromText, toRawListing } from '../lib/extract';
import { decodeEntities, htmlToText } from '../lib/html';
import { USER_AGENT } from '../lib/http';
import type { ListingSource } from './types';

/**
 * Alertes e-mail des portails (Leboncoin, SeLoger, Bien'ici, PAP…), lues dans votre boîte
 * par IMAP. C'est la voie légitime pour suivre les portails qui interdisent l'extraction
 * automatique : vous créez l'alerte sur le portail, le collecteur lit les e-mails reçus.
 *
 * Secrets du dépôt : IMAP_USER, IMAP_PASSWORD (mot de passe d'application Gmail),
 * et facultativement IMAP_HOST (imap.gmail.com par défaut) et IMAP_MAILBOX (INBOX par défaut).
 * La boîte est ouverte en lecture seule : aucun e-mail n'est marqué comme lu ni modifié.
 */

export interface Portal {
  id: string;
  label: string;
  sender: RegExp;
  /** Domaine des pages d'annonces, pour reconnaître le lien final derrière un lien de suivi. */
  domain: string;
}

export const PORTALS: Portal[] = [
  { id: 'leboncoin', label: 'Leboncoin', sender: /leboncoin/i, domain: 'leboncoin.fr' },
  { id: 'seloger', label: 'SeLoger', sender: /seloger/i, domain: 'seloger.com' },
  { id: 'bienici', label: "Bien'ici", sender: /bienici/i, domain: 'bienici.com' },
  { id: 'pap', label: 'PAP', sender: /\bpap\.fr|@pap\b/i, domain: 'pap.fr' },
  { id: 'logicimmo', label: 'Logic-Immo', sender: /logic-?immo/i, domain: 'logic-immo.com' },
  { id: 'ouestfrance-immo', label: 'Ouest-France Immo', sender: /ouestfrance-?immo/i, domain: 'ouestfrance-immo.com' },
  { id: 'paruvendu', label: 'ParuVendu', sender: /paruvendu/i, domain: 'paruvendu.fr' },
  { id: 'locservice', label: 'LocService', sender: /locservice/i, domain: 'locservice.fr' },
  { id: 'jinka', label: 'Jinka', sender: /jinka/i, domain: 'jinka.fr' },
];

const TRACKING_PARAMS = /^(utm_|mc_|xtor|at_|trk|tracking|campaign|cmp|ref|source|medium|email|uid|user|token|hash|sig)/i;

/** Retire de l'adresse les paramètres de suivi, qui peuvent identifier votre compte. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Les liens des alertes passent souvent par un service de suivi de clics, propre à votre compte.
 * On suit les redirections jusqu'à la page du portail, sans la télécharger, pour publier un lien neutre.
 * Si l'adresse finale reste introuvable, le lien n'est pas publié.
 */
async function resolveLink(href: string, portal: Portal): Promise<string | null> {
  let url = href;
  for (let hop = 0; hop < 6; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.hostname === portal.domain || parsed.hostname.endsWith(`.${portal.domain}`)) {
      return cleanUrl(url);
    }
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      const location = response.headers.get('location');
      if (!location) return null;
      url = new URL(location, url).toString();
    } catch {
      return null;
    }
  }
  return null;
}

/** Liens à ignorer dans un e-mail : désinscription, réglages, réseaux sociaux, applis. */
const NOISE_LINK =
  /unsubscribe|desinscri|désinscri|preferences|parametres|mon-compte|mes-alertes|facebook|instagram|twitter|linkedin|youtube|apple\.com|play\.google|aide|help|mentions|confidentialite|cgu/i;

const MARKER = (n: number) => `\n[[LIEN:${n}]]\n`;

/**
 * Découpe un e-mail d'alerte en annonces : chaque lien est un repère, le texte qui suit
 * (jusqu'au lien suivant vers une autre adresse) décrit l'annonce. Un bloc n'est retenu
 * que s'il contient un loyer et une surface.
 */
export function parseAlertEmail(html: string, portal: Portal, receivedAt: string): RawListing[] {
  const hrefs: string[] = [];
  const marked = html.replace(
    /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _q, dq: string | undefined, sq: string | undefined, inner: string) => {
      const href = decodeEntities(dq ?? sq ?? '').trim();
      hrefs.push(href);
      return `${MARKER(hrefs.length - 1)}${inner}`;
    },
  );
  const text = htmlToText(marked);

  // Découpe en segments : [index du lien, texte jusqu'au prochain lien vers une autre adresse].
  const parts = text.split(/\[\[LIEN:(\d+)\]\]/);
  const segments: { href: string; text: string }[] = [];
  let preamble = parts[0] ?? '';
  for (let i = 1; i < parts.length; i += 2) {
    const href = hrefs[Number(parts[i])];
    const body = parts[i + 1] ?? '';
    const last = segments[segments.length - 1];
    if (last && last.href === href) last.text += `\n${body}`;
    else segments.push({ href, text: body });
  }
  // Le texte placé avant le premier lien (photo sans lien, par exemple) rejoint le premier segment.
  if (segments[0] && preamble.trim().length < 400) segments[0].text = `${preamble}\n${segments[0].text}`;
  preamble = '';

  const listings: RawListing[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    if (!/^https?:\/\//i.test(segment.href) || NOISE_LINK.test(segment.href)) continue;
    const block = segment.text.trim();
    if (block.length < 15) continue;
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const title =
      lines.find((l) => /studio|appartement|\bt\d\b|\bf\d\b|pi[eè]ces?|logement|chambre|maison/i.test(l)) ??
      lines[0] ??
      '';
    const extracted = extractFromText(block, title);
    const raw = toRawListing(extracted, {
      source: portal.id,
      sourceLabel: portal.label,
      ref: segment.href,
      url: segment.href,
    });
    if (!raw) continue;
    const key = `${raw.priceText}|${raw.surfaceText}|${raw.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    listings.push({ ...raw, publishedAt: receivedAt.slice(0, 10) });
  }
  return listings;
}

const DAYS_BACK = 4;

/** Le strict nécessaire de l'API d'imapflow utilisé ici. */
interface ImapMessage {
  uid: number;
  envelope?: { date?: Date; from?: { name?: string; address?: string }[] };
  source?: Buffer;
}
interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  getMailboxLock(path: string, options?: { readOnly?: boolean }): Promise<{ release(): void }>;
  search(query: { since: Date }, options: { uid: boolean }): Promise<number[] | false>;
  fetch(
    range: number[],
    query: { envelope?: boolean; uid?: boolean },
    options: { uid: boolean },
  ): AsyncIterable<ImapMessage>;
  fetchOne(
    seq: string,
    query: { source: boolean },
    options: { uid: boolean },
  ): Promise<ImapMessage | false>;
}

export const emailAlertsSource: ListingSource = {
  id: 'alertes-email',
  label: 'Alertes e-mail des portails',
  disabledReason() {
    if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      return 'secrets IMAP_USER et IMAP_PASSWORD non configurés';
    }
    return null;
  },
  async fetch(debug) {
    // Chargées seulement si la source est active : la collecte fonctionne sans ces paquets.
    const { ImapFlow } = (await import('imapflow')) as unknown as {
      ImapFlow: new (options: Record<string, unknown>) => ImapClient;
    };
    const { simpleParser } = (await import('mailparser')) as unknown as {
      simpleParser: (source: Buffer) => Promise<{ html?: string | false; textAsHtml?: string }>;
    };

    const client = new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
      logger: false,
    });

    await client.connect();
    const listings: RawListing[] = [];
    let alertCount = 0;
    let unresolved = 0;
    try {
      const lock = await client.getMailboxLock(process.env.IMAP_MAILBOX || 'INBOX', {
        readOnly: true,
      });
      try {
        const since = new Date(Date.now() - DAYS_BACK * 24 * 3600 * 1000);
        const uids = (await client.search({ since }, { uid: true })) || [];
        const recent = uids.slice(-400);
        const matches: { uid: number; portal: Portal; date: string }[] = [];
        if (recent.length > 0) {
          for await (const message of client.fetch(recent, { envelope: true, uid: true }, { uid: true })) {
            const from =
              message.envelope?.from?.map((a) => `${a.name ?? ''} ${a.address ?? ''}`).join(' ') ?? '';
            const portal = PORTALS.find((p) => p.sender.test(from));
            if (portal) {
              matches.push({
                uid: message.uid,
                portal,
                date: (message.envelope?.date ?? new Date()).toISOString(),
              });
            }
          }
        }
        alertCount = matches.length;
        for (const match of matches) {
          const message = await client.fetchOne(String(match.uid), { source: true }, { uid: true });
          if (!message || !message.source) continue;
          const parsed = await simpleParser(message.source);
          const html = (parsed.html || parsed.textAsHtml || '') as string;
          const found = parseAlertEmail(html, match.portal, match.date);
          let resolved = 0;
          for (const listing of found) {
            const url = await resolveLink(listing.url, match.portal);
            if (!url) {
              unresolved += 1;
              continue;
            }
            const ref = new URL(url).pathname;
            listings.push({ ...listing, url, ref });
            resolved += 1;
          }
          if (debug) {
            console.log(
              `  [alertes] ${match.portal.label} du ${match.date.slice(0, 10)} : ${found.length} annonce(s), ${resolved} lien(s) vérifié(s)`,
            );
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return {
      listings,
      message: `${alertCount} e-mail(s) d'alerte lus sur les ${DAYS_BACK} derniers jours${
        unresolved ? `, ${unresolved} lien(s) sans adresse finale ignoré(s)` : ''
      }`,
    };
  },
};
