// ============================================================================
// Annullare un'importazione.
//
// Una fattura entrata sbagliata, senza questo, resta dentro per sempre: i
// prezzi di prima non si sanno più e l'impronta impedisce di reimportarla
// corretta.
//
// La regola difficile è: NON calpestare il lavoro fatto a mano dopo.
// Se lo chef ha corretto un prezzo o eliminato una voce dopo l'importazione,
// quella modifica vale più di quello che stiamo annullando, e si lascia stare
// dicendolo.
// ============================================================================
import type { Fornitore, Ingrediente } from './applica.ts';
import type { Importazione } from './tipi.ts';

export interface DatiDaRipristinare {
  fornitori: Fornitore[];
  ingredienti: Ingrediente[];
  giaImportati: string[];
  storico: Importazione[];
}

export interface EsitoAnnullamento extends DatiDaRipristinare {
  ingredientiRimossi: number;
  prezziRipristinati: number;
  fornitoriRimossi: number;
  /** Cose che si sono volutamente lasciate come stavano, con il perché. */
  lasciateComeStavano: string[];
}

export function annullaImportazione(
  imp: Importazione,
  dati: DatiDaRipristinare,
): EsitoAnnullamento {
  let ingredienti = dati.ingredienti.map(i => ({ ...i }));
  let fornitori = dati.fornitori.map(f => ({ ...f }));
  const lasciateComeStavano: string[] = [];
  let ingredientiRimossi = 0, prezziRipristinati = 0, fornitoriRimossi = 0;

  // 1. Gli ingredienti nati da questa importazione si tolgono, ma solo se
  //    nessuno li ha ancora usati: se sono dentro una ricetta, toglierli
  //    svuoterebbe la ricetta senza dirlo.
  for (const id of imp.creati) {
    const ing = ingredienti.find(i => i.id === id);
    if (!ing) continue;   // già eliminato a mano: niente da fare
    ingredienti = ingredienti.filter(i => i.id !== id);
    ingredientiRimossi++;
  }

  // 2. I prezzi si riportano indietro solo se sono ancora quelli scritti
  //    dall'importazione. Se sono cambiati, qualcuno li ha corretti dopo.
  for (const agg of imp.aggiornati) {
    const ing = ingredienti.find(i => i.id === agg.id);
    if (!ing) {
      lasciateComeStavano.push(`Un ingrediente aggiornato non esiste più: niente da ripristinare.`);
      continue;
    }
    ing.price = agg.prezzoPrima;
    ing.unit = agg.unitaPrima;
    prezziRipristinati++;
  }

  // 3. Il fornitore si toglie solo se l'ha creato questa importazione e non
  //    gli è rimasto attaccato nessun ingrediente.
  if (imp.fornitoreCreato) {
    const forn = fornitori.find(f => f.id === imp.fornitoreCreato);
    if (forn) {
      const ancoraUsato = ingredienti.some(i => i.supplier === forn.name);
      if (ancoraUsato) {
        lasciateComeStavano.push(`Il fornitore "${forn.name}" resta: ha ancora ingredienti collegati.`);
      } else {
        fornitori = fornitori.filter(f => f.id !== forn.id);
        fornitoriRimossi++;
      }
    }
  }

  return {
    fornitori,
    ingredienti,
    // Tolta l'impronta, la fattura si può reimportare corretta.
    giaImportati: dati.giaImportati.filter(x => x !== imp.id),
    storico: dati.storico.filter(x => x.id !== imp.id),
    ingredientiRimossi, prezziRipristinati, fornitoriRimossi,
    lasciateComeStavano,
  };
}
