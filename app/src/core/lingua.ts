// ============================================================================
// Lingue.
//
// La chiave di traduzione è la frase italiana stessa, non un codice inventato
// tipo "errore.salvataggio.fallito". Due motivi concreti:
//
//   - se una traduzione manca, a schermo compare l'italiano, che è leggibile.
//     Con i codici comparirebbe "errore.salvataggio.fallito" davanti al cliente;
//   - chi scrive il codice legge la frase vera mentre lavora, invece di dover
//     aprire un altro file per sapere cosa dirà quel pulsante.
//
// Il prezzo è che cambiare il testo italiano scollega la traduzione. Vale la
// pena: un testo scollegato si nota (torna in italiano), un codice sbagliato no.
// ============================================================================

import { impostaLingua } from './valuta.ts';

export type Lingua = 'it' | 'en';

export const LINGUE: { codice: Lingua; nome: string }[] = [
  { codice: 'it', nome: 'Italiano' },
  { codice: 'en', nome: 'English' },
];

type Dizionario = Record<string, string>;
const dizionari: Partial<Record<Lingua, Dizionario>> = {};

const CHIAVE_SALVATAGGIO = 'comanda_lingua';

function linguaIniziale(): Lingua {
  try {
    const scelta = localStorage.getItem(CHIAVE_SALVATAGGIO);
    if (scelta === 'it' || scelta === 'en') return scelta;
  } catch { /* browser che blocca lo storage: si continua col rilevamento */ }
  // Nessuna scelta esplicita: si segue il browser, con l'italiano come base.
  const preferite = (navigator.languages && navigator.languages.length)
    ? navigator.languages : [navigator.language || 'it'];
  for (const l of preferite) {
    const base = String(l).toLowerCase().split('-')[0];
    if (base === 'it') return 'it';
    if (base === 'en') return 'en';
  }
  return 'it';
}

let corrente: Lingua = linguaIniziale();
impostaLingua(corrente);

export function lingua(): Lingua { return corrente; }

export async function caricaLingua(l: Lingua): Promise<void> {
  corrente = l;
  // Anche i PREZZI cambiano lingua, non solo le parole: «18,00 €» in italiano
  // e «€18.00» in inglese sono lo stesso importo scritto come si scrive li'.
  impostaLingua(l);
  try { localStorage.setItem(CHIAVE_SALVATAGGIO, l); } catch { /* non bloccante */ }
  if (l === 'it') return;                 // l'italiano è il testo nel codice
  if (dizionari[l]) return;               // già in memoria
  try {
    // Import dinamico: chi usa l'app in italiano non scarica le traduzioni.
    const mod = await import(`../lingue/${l}.json`);
    dizionari[l] = (mod.default ?? mod) as Dizionario;
  } catch {
    // Dizionario mancante o non raggiungibile: si resta sull'italiano invece
    // di mostrare una pagina vuota.
    dizionari[l] = {};
  }
}

/**
 * Traduce. I segnaposto si scrivono {nome} e si passano come secondo argomento:
 *   t('Ciao {chi}', {chi: 'Marco'})
 */
export function t(frase: string, valori?: Record<string, string | number>): string {
  const dizionario = dizionari[corrente];
  let testo = (dizionario && dizionario[frase]) || frase;
  if (valori) {
    for (const [chiave, valore] of Object.entries(valori)) {
      testo = testo.split('{' + chiave + '}').join(String(valore));
    }
  }
  return testo;
}

/**
 * Traduce i testi statici del markup, marcati con data-t.
 *
 * Il testo italiano resta nell'HTML e fa da chiave: la pagina è leggibile
 * anche prima che il JavaScript parta, e chi legge il markup vede la frase
 * vera invece di un codice.
 */
export function traduciMarkup(radice: ParentNode = document): void {
  if (corrente === 'it') return;
  for (const el of radice.querySelectorAll<HTMLElement>('[data-t]')) {
    // L'originale si conserva: cambiando lingua due volte non si traduce
    // una traduzione.
    const originale = el.dataset['tOriginale'] ?? el.textContent ?? '';
    el.dataset['tOriginale'] = originale;
    el.textContent = t(originale.trim());
  }
  for (const attributo of ['placeholder', 'title'] as const) {
    for (const el of radice.querySelectorAll<HTMLElement>(`[data-t-${attributo}]`)) {
      const chiave = `t${attributo[0]!.toUpperCase()}${attributo.slice(1)}Originale`;
      const originale = el.dataset[chiave] ?? el.getAttribute(attributo) ?? '';
      el.dataset[chiave] = originale;
      el.setAttribute(attributo, t(originale));
    }
  }
}

/** Le frasi chieste per cui non esiste traduzione: serve a completare i dizionari. */
const mancanti = new Set<string>();
export function segnalaMancante(frase: string): void {
  if (corrente !== 'it') mancanti.add(frase);
}
export function traduzioniMancanti(): string[] { return [...mancanti]; }
