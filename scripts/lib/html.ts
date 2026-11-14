/** Outils HTML sans dépendance : les pages d'annonces sont lues comme du texte. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
  sup2: '²',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ucirc: 'û',
  ugrave: 'ù',
  icirc: 'î',
  iuml: 'ï',
  rsquo: '’',
  lsquo: '‘',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  deg: '°',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Texte visible d'un fragment HTML, avec un retour à la ligne par bloc. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|td|th|h[1-6]|section|article|header|footer|dt|dd|span)>/gi, '\n')
      // Les attributs entre guillemets peuvent contenir « > » (data-action="click->modal#open").
      .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' '),
  )
    .replace(/[ \t  ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

/** Balises <meta> OpenGraph et description, indexées par property ou name. */
export function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(m[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = attrs.content.trim();
  }
  return meta;
}

export function extractTitle(html: string): string {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) return htmlToText(h1).replace(/\s+/g, ' ').trim();
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeEntities(title).replace(/\s+/g, ' ').trim() : '';
}

/** Tous les objets JSON-LD de la page, @graph et tableaux aplatis. */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      objects.push(obj);
      if (obj['@graph']) visit(obj['@graph']);
    }
  };
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      // JSON-LD mal formé : on l'ignore.
    }
  }
  return objects;
}

/** Liens absolus de la page, dans l'ordre, sans doublon. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const href = decodeEntities(m[2] ?? m[3] ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      url.hash = '';
      links.add(url.toString());
    } catch {
      // Lien invalide.
    }
  }
  return [...links];
}

/**
 * Découpe une page ou un e-mail en blocs, un par lien : le texte qui suit un lien, jusqu'au
 * lien suivant vers une autre adresse, décrit la cible de ce lien (carte d'annonce, ligne d'alerte).
 */
export function segmentByLinks(html: string, baseUrl?: string): { href: string; text: string }[] {
  const hrefs: string[] = [];
  const marked = html.replace(
    /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/a>/gi,
    (_match, attrs: string, inner: string) => {
      const href = decodeEntities(attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i)?.slice(2).find(Boolean) ?? '').trim();
      let absolute = href;
      try {
        absolute = baseUrl ? new URL(href, baseUrl).toString() : href;
      } catch {
        // Lien invalide : gardé tel quel, il sera ignoré.
      }
      hrefs.push(absolute);
      return `\n[[LIEN:${hrefs.length - 1}]]\n${inner}`;
    },
  );
  const parts = htmlToText(marked).split(/\[\[LIEN:(\d+)\]\]/);
  const segments: { href: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const href = hrefs[Number(parts[i])];
    const body = parts[i + 1] ?? '';
    const last = segments[segments.length - 1];
    if (last && last.href === href) last.text += `\n${body}`;
    else segments.push({ href, text: body });
  }
  // Le texte placé avant le premier lien (photo sans lien, par exemple) rejoint le premier bloc.
  const preamble = parts[0] ?? '';
  if (segments[0] && preamble.trim().length < 400) segments[0].text = `${preamble}\n${segments[0].text}`;
  return segments.map((s) => ({ href: s.href, text: s.text.trim() }));
}
