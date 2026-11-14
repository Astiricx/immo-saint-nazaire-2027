import { isAllowed, parseRobots, type RobotsRule } from './robots';

/** Le collecteur s'identifie clairement, avec un lien vers ce dépôt. */
export const USER_AGENT =
  'immo-saint-nazaire-2027/2.0 (recherche personnelle de logement, 1 passage par jour; +https://github.com/Astiricx/immo-saint-nazaire-2027)';
const AGENT_TOKEN = 'immo-saint-nazaire-2027';

/** Pause minimale entre deux requêtes vers un même site. */
const DELAY_MS = 2000;
const TIMEOUT_MS = 20000;

export class BlockedError extends Error {}

const robotsCache = new Map<string, RobotsRule[] | 'tout-refuse'>();
const lastRequest = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle(host: string) {
  const elapsed = Date.now() - (lastRequest.get(host) ?? 0);
  if (elapsed < DELAY_MS) await sleep(DELAY_MS - elapsed);
  lastRequest.set(host, Date.now());
}

async function robotsFor(origin: string): Promise<RobotsRule[] | 'tout-refuse'> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  let result: RobotsRule[] | 'tout-refuse';
  try {
    await throttle(new URL(origin).host);
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      result = parseRobots(await response.text(), AGENT_TOKEN);
    } else if (response.status >= 400 && response.status < 500) {
      // RFC 9309 : robots.txt absent (4xx) = aucune restriction.
      result = [];
    } else {
      // Erreur serveur : dans le doute, on ne collecte pas.
      result = 'tout-refuse';
    }
  } catch {
    result = 'tout-refuse';
  }
  robotsCache.set(origin, result);
  return result;
}

export async function robotsAllows(url: string): Promise<boolean> {
  return (await robotsVerdict(url)) === null;
}

/** null si la page est autorisée, sinon la raison du refus. */
async function robotsVerdict(url: string): Promise<string | null> {
  const { origin, pathname, search } = new URL(url);
  const rules = await robotsFor(origin);
  if (rules === 'tout-refuse') return 'robots.txt inaccessible : collecte suspendue par prudence';
  return isAllowed(rules, `${pathname}${search}`) ? null : `robots.txt n'autorise pas ${pathname}`;
}

/** Récupère une page HTML en respectant robots.txt et un rythme lent. */
export async function fetchPage(url: string): Promise<string> {
  const refusal = await robotsVerdict(url);
  if (refusal) throw new BlockedError(refusal);
  const { host } = new URL(url);
  await throttle(host);
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'fr-FR,fr;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 403 || response.status === 429) {
    throw new BlockedError(`le site refuse l'accès automatisé (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
  return response.text();
}

/**
 * Géocodage d'une adresse par le service public de la Géoplateforme (IGN),
 * avec repli sur l'ancienne API Adresse. Renvoie null si le résultat n'est pas fiable.
 */
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${address}, 44600 Saint-Nazaire`);
  const endpoints = [
    `https://data.geopf.fr/geocodage/search?q=${query}&postcode=44600&limit=1`,
    `https://api-adresse.data.gouv.fr/search/?q=${query}&postcode=44600&limit=1`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const json = (await response.json()) as {
        features?: {
          geometry?: { coordinates?: [number, number] };
          properties?: { score?: number; postcode?: string; type?: string };
        }[];
      };
      const feature = json.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      const props = feature?.properties;
      if (!coordinates || !props) return null;
      // Une commune seule (« municipality ») ne situe pas le logement.
      if ((props.score ?? 0) < 0.55 || props.postcode !== '44600' || props.type === 'municipality') {
        return null;
      }
      const point = { lng: coordinates[0], lat: coordinates[1] };
      // Garde-fou : un point à plus de 12 km du centre de Saint-Nazaire est une erreur de géocodage.
      if (Math.hypot((point.lat - 47.2745) * 111, (point.lng + 2.2125) * 75) > 12) return null;
      return point;
    } catch {
      // On tente le service suivant.
    }
  }
  return null;
}
