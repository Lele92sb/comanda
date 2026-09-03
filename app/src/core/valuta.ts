// ============================================================================
// LA VALUTA.
//
// Fino a ieri il segno dell'euro era scritto a mano in trentadue punti, sempre
// cosi': `'€ ' + n.toFixed(2)`. Due cose non andavano, e la seconda e' peggio
// della prima.
//
//   1. IL SEGNO ERA FISSO. Una cucina a Londra, a New York o a Zurigo vedeva
//      prezzi in euro, e non c'era nessun posto in cui cambiarlo.
//
//   2. IL NUMERO ERA SCRITTO IN INGLESE. `toFixed(2)` mette il PUNTO come
//      separatore decimale: «€ 18.00». In italiano si scrive «18,00 €» — la
//      virgola, e il segno dopo. L'app era gia' sbagliata per chi la usa ora,
//      non solo per chi la usera'.
//
// SI USA `Intl.NumberFormat`, che sa tutte e tre le cose che cambiano da paese
// a paese e che nessuno ricorda mai tutte insieme:
//
//     it + EUR  ->  18,00 €        en + EUR  ->  €18.00
//     en + USD  ->  $18.00         it + USD  ->  18,00 USD
//     en + GBP  ->  £18.00         ja + JPY  ->  ￥1,800   (zero decimali!)
//
// Il giapponese non ha decimali, il franco svizzero ne ha due ma con
// l'apostrofo per le migliaia, la corona svedese mette il segno in fondo. Ogni
// tabella scritta a mano sarebbe sbagliata da qualche parte: questa e' nel
// browser, ed e' aggiornata da chi il browser lo scrive.
//
// QUESTO MODULO NON TOCCA IL DOM ed e' per questo che ha dei test veri, che
// girano dentro Node. La valuta e la lingua gliele si dicono da fuori
// (`impostaValuta`, `impostaLingua`) invece di andarsele a leggere: se leggesse
// `localStorage` da solo, non si potrebbe piu' provare.
// ============================================================================

export interface Valuta {
  /** Il codice ISO 4217. E' quello che si salva. */
  codice: string;
  nome: string;
}

/**
 * Le valute proposte nella tendina. Non e' l'elenco completo del mondo — sono
 * circa centottanta, e una tendina da centottanta voci non la scorre nessuno —
 * ma i posti dove una cucina sta davvero. Il formato pero' non dipende da
 * questa lista: `Intl` accetta qualunque codice ISO, quindi aggiungerne una e'
 * una riga qui e nient'altro.
 */
export const VALUTE: Valuta[] = [
  { codice: 'EUR', nome: 'Euro' },
  { codice: 'GBP', nome: 'Sterlina britannica' },
  { codice: 'USD', nome: 'Dollaro statunitense' },
  { codice: 'CHF', nome: 'Franco svizzero' },
  { codice: 'SEK', nome: 'Corona svedese' },
  { codice: 'NOK', nome: 'Corona norvegese' },
  { codice: 'DKK', nome: 'Corona danese' },
  { codice: 'PLN', nome: 'Zloty polacco' },
  { codice: 'CZK', nome: 'Corona ceca' },
  { codice: 'HUF', nome: 'Fiorino ungherese' },
  { codice: 'RON', nome: 'Leu rumeno' },
  { codice: 'TRY', nome: 'Lira turca' },
  { codice: 'CAD', nome: 'Dollaro canadese' },
  { codice: 'AUD', nome: 'Dollaro australiano' },
  { codice: 'NZD', nome: 'Dollaro neozelandese' },
  { codice: 'JPY', nome: 'Yen giapponese' },
  { codice: 'SGD', nome: 'Dollaro di Singapore' },
  { codice: 'HKD', nome: 'Dollaro di Hong Kong' },
  { codice: 'AED', nome: 'Dirham degli Emirati' },
  { codice: 'ILS', nome: 'Shekel israeliano' },
  { codice: 'MXN', nome: 'Peso messicano' },
  { codice: 'BRL', nome: 'Real brasiliano' },
  { codice: 'ZAR', nome: 'Rand sudafricano' },
  { codice: 'INR', nome: 'Rupia indiana' },
];

export const VALUTA_PREDEFINITA = 'EUR';

/* --------------------------------------------------------------------------
   LA PARTE PURA: sa formattare, non sa niente dell'app.
   -------------------------------------------------------------------------- */

/**
 * Un importo, scritto come lo scriverebbe chi parla quella lingua.
 *
 * `decimaliInPiu` serve ai prezzi al chilo: un ingrediente a 2,847 €/kg vuole
 * la terza cifra, perche' moltiplicata per venti chili la terza cifra e' sei
 * centesimi. I totali no: nessuno paga i millesimi.
 */
export function formatta(
  importo: number,
  valuta: string,
  lingua: string,
  decimaliInPiu = 0,
): string {
  const n = Number.isFinite(importo) ? importo : 0;
  try {
    const base = cifreDi(valuta, lingua);
    return new Intl.NumberFormat(lingua, {
      style: 'currency',
      currency: valuta,
      minimumFractionDigits: base + decimaliInPiu,
      maximumFractionDigits: base + decimaliInPiu,
    }).format(n);
  } catch {
    // Un codice valuta che il browser non conosce non deve far sparire il
    // numero: il prezzo si legge lo stesso, col codice davanti.
    return valuta + ' ' + n.toFixed(2 + decimaliInPiu);
  }
}

/**
 * Quante cifre decimali vuole questa valuta: due per l'euro, ZERO per lo yen.
 * Lo si chiede a `Intl` invece di tenere una tabella, che sarebbe una tabella
 * in piu' da sbagliare.
 */
export function cifreDi(valuta: string, lingua = 'it'): number {
  try {
    const o = new Intl.NumberFormat(lingua, { style: 'currency', currency: valuta })
      .resolvedOptions();
    return o.maximumFractionDigits ?? 2;
  } catch { return 2; }
}

/**
 * Il solo segno, per le etichette: «Prezzo acquisto (€/unita')».
 * Si ricava formattando zero e togliendo le cifre, invece di tenere una
 * seconda tabella di simboli che prima o poi si allontana dalla prima.
 */
export function simboloDi(valuta: string, lingua = 'it'): string {
  try {
    const parti = new Intl.NumberFormat(lingua, { style: 'currency', currency: valuta })
      .formatToParts(0);
    return parti.find(p => p.type === 'currency')?.value ?? valuta;
  } catch { return valuta; }
}

/** Vero se il codice e' una valuta che `Intl` sa trattare. */
export function valutaValida(codice: unknown): codice is string {
  if (typeof codice !== 'string' || !/^[A-Z]{3}$/.test(codice)) return false;
  try { new Intl.NumberFormat('it', { style: 'currency', currency: codice }); return true; }
  catch { return false; }
}

/* --------------------------------------------------------------------------
   LA PARTE CHE L'APP USA: ricorda la scelta e la applica.
   -------------------------------------------------------------------------- */

let corrente: string = VALUTA_PREDEFINITA;
let linguaCorrente = 'it';

/** La valuta della cucina. Un codice sconosciuto non passa: si resta sull'euro. */
export function impostaValuta(codice: unknown): void {
  corrente = valutaValida(codice) ? codice : VALUTA_PREDEFINITA;
}

export function impostaLingua(l: string): void {
  linguaCorrente = l || 'it';
}

export function valuta(): string { return corrente; }

/** Un importo normale: totali, costi, prezzi di vendita. */
export function soldi(importo: number): string {
  return formatta(importo, corrente, linguaCorrente);
}

/**
 * Un prezzo al chilo o al litro, con una cifra in piu'. E' il prezzo che poi
 * viene moltiplicato, e li' l'arrotondamento si vede.
 */
export function soldiUnitari(importo: number): string {
  return formatta(importo, corrente, linguaCorrente, 1);
}

/** Il segno da mettere in un'etichetta. */
export function simbolo(): string {
  return simboloDi(corrente, linguaCorrente);
}
