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

export type Lingua = 'it' | 'en' | 'es';

export const LINGUE: { codice: Lingua; nome: string }[] = [
  { codice: 'it', nome: 'Italiano' },
  { codice: 'en', nome: 'English' },
  { codice: 'es', nome: 'Español' },
];

/* La regione per ogni lingua. Sta QUI, in cima, e non accanto alle funzioni
   sulle date che la usano: viene letta mentre il modulo si carica, per dire
   subito alla valuta in che lingua scrivere i prezzi, e una `const` piu' in
   basso a quel punto non esiste ancora. E' lo stesso inciampo che costava un
   errore a ogni avvio in generatore.js — li' l'ha trovato il browser, qui il
   compilatore. Il compilatore costa meno. */
const REGIONI: Record<Lingua, string> = { it: 'it-IT', en: 'en-GB', es: 'es-ES' };

type Dizionario = Record<string, string>;
const dizionari: Partial<Record<Lingua, Dizionario>> = {};

const CHIAVE_SALVATAGGIO = 'comanda_lingua';

function linguaIniziale(): Lingua {
  try {
    const scelta = localStorage.getItem(CHIAVE_SALVATAGGIO);
    if (scelta === 'it' || scelta === 'en' || scelta === 'es') return scelta;
  } catch { /* browser che blocca lo storage: si continua col rilevamento */ }
  // Nessuna scelta esplicita: si segue il browser, con l'italiano come base.
  const preferite = (navigator.languages && navigator.languages.length)
    ? navigator.languages : [navigator.language || 'it'];
  for (const l of preferite) {
    const base = String(l).toLowerCase().split('-')[0];
    if (base === 'it') return 'it';
    if (base === 'en') return 'en';
    if (base === 'es') return 'es';
  }
  return 'it';
}

let corrente: Lingua = linguaIniziale();
impostaLingua(REGIONI[corrente]);

export function lingua(): Lingua { return corrente; }

export async function caricaLingua(l: Lingua): Promise<void> {
  corrente = l;
  // Anche i PREZZI cambiano lingua, non solo le parole: «18,00 €» in italiano
  // e «€18.00» in inglese sono lo stesso importo scritto come si scrive li'.
  // Gli si passa la REGIONE, la stessa che usano le date: due versioni della
  // stessa informazione prima o poi si allontanano.
  impostaLingua(REGIONI[l]);
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
 * SEGNA una frase da tradurre, senza tradurla adesso.
 *
 * Serve dove il testo e' un DATO e non una chiamata: le etichette della
 * navigazione, per esempio, stanno in un elenco e vengono tradotte molto dopo,
 * quando si disegna la barra. Per `controlla-lingue.cjs` quelle frasi non
 * esistevano — cercava `t(...)` e li' non c'e' — e infatti dichiarava «non piu'
 * nel codice» undici voci che si vedono ogni giorno: Brigata, Ingredienti,
 * Piatti, Fabbisogno, Menu.
 *
 * Un dizionario che segnala male e' peggio di nessun dizionario: si smette di
 * credergli. Questa funzione non fa niente — restituisce quello che riceve — ed
 * esiste solo per farsi trovare.
 *
 *     { id:'brigata', label: frase('Brigata') }   // segnata qui
 *     nav.textContent = t(voce.label);            // tradotta li'
 */
export function frase(s: string): string { return s; }

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

/* ============================================================================
   LE DATE PARLANO LA STESSA LINGUA DEL RESTO.

   Erano scritte 'it-IT' in dieci punti: chi apriva l'app in inglese leggeva
   «giovedì 3 settembre» sopra una griglia tradotta. Lo stesso difetto dei
   prezzi, nello stesso posto — il formato scritto a mano invece che chiesto
   al browser.

   La lingua si allarga a una REGIONE, e la scelta non e' neutra:
     it → it-IT     en → en-GB     es → es-ES
   L'inglese va in Regno Unito, non in America, perche' li' la data si scrive
   giorno-mese come nel resto dell'app: la settimana comincia di lunedi', i
   turni sono un calendario europeo, e «9/3» che vuol dire 3 settembre in una
   riga e 9 marzo in quella sotto e' il genere di errore che si scopre a
   servizio iniziato.
   ============================================================================ */

/** La regione da passare a Intl e a toLocaleDateString. */
export function regione(): string { return REGIONI[corrente] ?? 'it-IT'; }

/** «giovedì 3 settembre» — per il titolo di una giornata. */
export function dataLunga(d: Date): string {
  return d.toLocaleDateString(regione(), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** «gio 3 set» — dove lo spazio e' poco: le celle, gli elenchi. */
export function dataCorta(d: Date): string {
  return d.toLocaleDateString(regione(), { weekday: 'short', day: 'numeric', month: 'short' });
}

/** «3 set» — senza il giorno della settimana. */
export function giornoMese(d: Date): string {
  return d.toLocaleDateString(regione(), { day: 'numeric', month: 'short' });
}

/** «settembre 2026» — l'intestazione di un mese. */
export function meseAnno(d: Date): string {
  return d.toLocaleDateString(regione(), { month: 'long', year: 'numeric' });
}

/** «03/09/2026» — una data e basta. */
export function dataNumerica(d: Date): string {
  return d.toLocaleDateString(regione());
}

/** «3 set 2026, 14:30» — quando e' successo qualcosa. */
export function dataOra(d: Date): string {
  return d.toLocaleString(regione(),
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
