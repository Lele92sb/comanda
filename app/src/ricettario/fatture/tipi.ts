// ============================================================================
// Fatture elettroniche: i tipi che fanno da contratto fra le FONTI (da dove
// arrivano le fatture) e il resto dell'app (cosa ci fa).
//
// Oggi la fonte è una sola — i file che lo chef carica a mano. Domani saranno
// un gestionale collegato o un intermediario che legge dal Sistema di
// Interscambio. Il resto dell'app non deve accorgersene: riceve documenti e
// basta.
// ============================================================================

/** Un documento così come arriva dalla fonte, prima di essere interpretato. */
export interface DocumentoFattura {
  /**
   * Identificativo stabile del documento presso la fonte. È ciò che impedisce
   * di reimportare due volte la stessa fattura quando l'import diventerà
   * automatico e girerà ogni giorno.
   */
  id: string;
  /** FatturaPA in XML. Dai file firmati (.p7m) il contenuto è già estratto. */
  xml: string;
  /** Etichetta leggibile, per i messaggi d'errore: il nome del file, o il numero. */
  etichetta: string;
}

/** Una fonte da cui arrivano le fatture. */
export interface FonteFatture {
  /** Identificativo tecnico: 'file', 'fatture-in-cloud', ... */
  readonly id: string;
  /** Nome mostrato allo chef. */
  readonly nome: string;
  /** Se questa fonte è utilizzabile ora (collegata, configurata). */
  disponibile(): boolean;
  /** I documenti da importare. Le fonti automatiche filtrano per periodo. */
  elenca(periodo?: { dal?: string; al?: string }): Promise<DocumentoFattura[]>;
}

/** Il fornitore che ha emesso la fattura. */
export interface FornitoreFattura {
  nome: string;
  piva: string;
  telefono: string;
  email: string;
  indirizzo: string;
}

/** Una riga di merce sulla fattura. */
export interface RigaFattura {
  descrizione: string;
  quantita: number;
  unitaMisura: string;
  prezzoUnitario: number;
}

/** Una fattura interpretata. */
export interface FatturaLetta {
  fornitore: FornitoreFattura;
  righe: RigaFattura[];
  /** Numero e data servono a riconoscere un doppione anche senza id di fonte. */
  numero: string;
  data: string;
}

/**
 * Traccia di un'importazione, tenuta per poterla annullare.
 * Senza questo, una fattura entrata sbagliata resta dentro per sempre: i
 * prezzi vecchi non si sanno più, e l'impronta impedisce di reimportarla.
 */
export interface Importazione {
  /** Impronta del documento: è anche la chiave che ne impedisce il doppione. */
  id: string;
  quando: string;
  etichetta: string;
  fornitore: string;
  /** Id degli ingredienti nati da questa importazione. */
  creati: string[];
  /** Ingredienti già esistenti, col valore che avevano prima. */
  aggiornati: { id: string; prezzoPrima: number | string; unitaPrima: string }[];
  /** Id del fornitore, se è stato creato proprio da questa importazione. */
  fornitoreCreato?: string;
}

/** Cosa cambierebbe l'importazione, prima di applicarlo davvero. */
export interface EsitoImportazione {
  fornitoriNuovi: number;
  ingredientiNuovi: number;
  ingredientiAggiornati: number;
  scartati: number;
  /** Righe di resoconto da mostrare allo chef, in ordine. */
  resoconto: string[];
  /** Ingredienti appena creati: sono quelli di cui stimare la resa. */
  creati: unknown[];
}
