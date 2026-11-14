/**
 * Mode privé : actif dès que le secret LISTINGS_PASSPHRASE est défini.
 * Les annonces sont alors publiées chiffrées, et les journaux GitHub Actions — publics sur
 * un dépôt public — ne montrent jamais leur contenu : seulement des comptes et des noms de champs.
 */
export const PASSPHRASE = process.env.LISTINGS_PASSPHRASE?.trim() ?? '';
export const PRIVATE_MODE = PASSPHRASE.length > 0;

/** Peut-on écrire le contenu d'une annonce dans le journal ? */
export function canLogContent(debug: boolean): boolean {
  return debug && !PRIVATE_MODE;
}
