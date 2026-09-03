// ============================================================================
// COME SI CERCA, in un posto solo.
//
// Sei elenchi diversi devono cercare allo stesso modo, altrimenti chi impara a
// cercare fra gli ingredienti si ritrova a non trovare niente fra i piatti e
// pensa che il piatto non ci sia.
//
// TRE COSE CHE UN `includes()` NON FA, e per cui la ricerca ingenua sembra
// rotta proprio quando serve:
//
//   1. GLI ACCENTI. In cucina sono dappertutto: ragù, purè, sedano rapa,
//      crème. Chi cerca al volo dal telefono scrive «ragu» — la tastiera
//      l'accento lo fa fare apposta — e con un confronto secco non trova
//      niente. Si tolgono da tutti e due i lati: chi scrive «ragù» trova
//      «ragu», e viceversa.
//
//   2. LE PAROLE FUORI ORDINE. «pom san» deve trovare «Pomodoro San Marzano
//      DOP», e «san pom» pure. Le parole si cercano tutte, ognuna per conto
//      suo, in qualunque ordine: è come cerca chiunque e non ci pensa nemmeno.
//      Un `includes` su tutta la frase non trova niente perché le parole nel
//      nome non sono attaccate.
//
//   3. PIÙ CAMPI INSIEME. Un ingrediente lo si cerca per nome, ma anche per
//      fornitore: «rossi» deve tirare fuori tutto quello che compra da
//      Ortofrutta Rossi. Chi cerca non sa e non deve sapere in quale campo sta
//      scritta la cosa che ha in mente.
//
// NON TOCCA IL DOM ed è per questo che ha dei test: la ricerca è la cosa che
// si rompe più facilmente in silenzio, perché «non trovo niente» sembra sempre
// colpa di chi cerca.
// ============================================================================

/**
 * Toglie accenti e maiuscole. NFD separa la lettera dal suo segno, e i segni
 * stanno tutti nell'intervallo U+0300–U+036F: si buttano via quelli e resta la
 * lettera nuda.
 */
export function piatto(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    // Scritto con gli escape e non coi caratteri veri: sono segni che a
    // schermo non si vedono, e un editor che «sistema» il file li puo'
    // riattaccare alla lettera precedente senza che nessuno se ne accorga.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Vero se `dove` contiene TUTTE le parole di `cosa`, in qualunque ordine.
 * Una ricerca vuota combacia con tutto: chi non ha ancora scritto niente vuole
 * vedere l'elenco intero, non uno vuoto.
 */
export function combacia(dove: string, cosa: string): boolean {
  const ago = piatto(cosa);
  if (!ago) return true;
  const pagliaio = piatto(dove);
  return ago.split(/\s+/).every(parola => pagliaio.includes(parola));
}

/**
 * Filtra un elenco guardando i campi che gli si indicano.
 *
 * `campi` è una funzione e non una lista di nomi apposta: quello che si cerca
 * spesso non è un campo ma qualcosa di composto — il nome di una partita
 * ricavato dal suo id, le sigle dei turni di una persona. Una funzione le
 * prende tutte, un elenco di nomi no.
 */
export function filtra<T>(voci: T[], cosa: string, campi: (v: T) => Array<unknown>): T[] {
  if (!piatto(cosa)) return voci;
  return voci.filter(v => combacia(campi(v).filter(Boolean).join(' '), cosa));
}

/**
 * Sotto quante voci un campo di ricerca e' rumore invece che aiuto.
 *
 * Con sei ingredienti si vede tutto a colpo d'occhio e un campo in cima e'
 * solo una riga in meno di elenco. Con trecento, cercare e' l'unico modo. La
 * soglia sta qui e non in sei componenti perche' altrimenti fra sei mesi
 * sarebbe sei soglie diverse.
 */
export const SOGLIA_RICERCA = 8;
