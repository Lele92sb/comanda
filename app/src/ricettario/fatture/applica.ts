// ============================================================================
// Da fatture lette a modifiche su fornitori e ingredienti.
//
// Funzione pura: riceve i dati attuali, restituisce cosa cambia. Non salva e
// non tocca lo schermo, quindi si può verificare senza browser — e va
// verificata, perché decide se un ingrediente è NUOVO o è lo stesso di prima.
// Sbagliare quel riconoscimento significa duplicare mezzo magazzino, oppure
// sovrascrivere il prezzo dell'ingrediente sbagliato.
// ============================================================================
import { leggiFatturaXML, unitaDaFattura } from './leggi.ts';
import { soldiUnitari } from '../../core/valuta.ts';
import { èRigaDiServizio } from './servizi.ts';
import type { DocumentoFattura, Importazione } from './tipi.ts';

export interface Fornitore {
  id: string; name: string; piva?: string;
  phone?: string; email?: string; address?: string;
}
export interface Ingrediente {
  id: string; name: string; supplier: string;
  unit: string; price: number | string; yieldPct: number;
  yieldEstimated?: boolean;
}

export interface DatiCorrenti {
  fornitori: Fornitore[];
  ingredienti: Ingrediente[];
  /** Id dei documenti già importati: impedisce di rifare due volte lo stesso. */
  giaImportati: string[];
  /** Traccia di ogni importazione, per poterla annullare. */
  storico: Importazione[];
}

export interface Modifiche {
  fornitori: Fornitore[];
  ingredienti: Ingrediente[];
  giaImportati: string[];
  storico: Importazione[];
  creati: Ingrediente[];
  resoconto: string[];
  fornitoriNuovi: number;
  ingredientiNuovi: number;
  ingredientiAggiornati: number;
  scartati: number;
  saltatiPerchéGiàImportati: number;
  /** Righe riconosciute come servizio e non importate come merce. */
  righeDiServizio: number;
}

/**
 * Riconosce lo stesso fornitore fra una fattura e l'altra. La partita IVA è il
 * riferimento buono: il nome cambia grafia ("Rossi Srl", "ROSSI S.R.L.") e
 * creerebbe un fornitore nuovo a ogni fattura.
 */
function trovaFornitore(fornitori: Fornitore[], piva: string, nome: string): Fornitore | undefined {
  if (piva) {
    const perPiva = fornitori.find(f => f.piva && f.piva === piva);
    if (perPiva) return perPiva;
  }
  const n = nome.trim().toLowerCase();
  return fornitori.find(f => f.name.trim().toLowerCase() === n);
}

export function applicaFatture(
  documenti: DocumentoFattura[],
  dati: DatiCorrenti,
  nuovoId: () => string,
  adesso: () => string = () => new Date().toISOString(),
): Modifiche {
  const fornitori = dati.fornitori.map(f => ({ ...f }));
  const ingredienti = dati.ingredienti.map(i => ({ ...i }));
  const giaImportati = [...dati.giaImportati];
  const storico = [...dati.storico];
  const creati: Ingrediente[] = [];
  const resoconto: string[] = [];
  let fornitoriNuovi = 0, ingredientiNuovi = 0, ingredientiAggiornati = 0;
  let scartati = 0, saltatiPerchéGiàImportati = 0, righeDiServizio = 0;

  for (const doc of documenti) {
    if (giaImportati.includes(doc.id)) {
      saltatiPerchéGiàImportati++;
      continue;
    }

    const fattura = leggiFatturaXML(doc.xml);
    if (!fattura) {
      scartati++;
      resoconto.push(`⚠ ${doc.etichetta}: non è una FatturaPA leggibile.`);
      continue;
    }

    // Traccia di cosa fa QUESTO documento, per poterlo annullare da solo.
    const traccia: Importazione = {
      id: doc.id, quando: adesso(), etichetta: doc.etichetta,
      fornitore: fattura.fornitore.nome, creati: [], aggiornati: [],
    };

    let fornitore = trovaFornitore(fornitori, fattura.fornitore.piva, fattura.fornitore.nome);
    if (!fornitore) {
      fornitore = {
        id: nuovoId(), name: fattura.fornitore.nome, piva: fattura.fornitore.piva,
        phone: fattura.fornitore.telefono, email: fattura.fornitore.email,
        address: fattura.fornitore.indirizzo,
      };
      fornitori.push(fornitore);
      fornitoriNuovi++;
      traccia.fornitoreCreato = fornitore.id;
      resoconto.push(`+ Nuovo fornitore: ${fornitore.name}`);
    }

    for (const riga of fattura.righe) {
      // Trasporto, imballo, contributo CONAI: non sono merce e in anagrafica
      // diventerebbero ingredienti fantasma. Si dicono, non si nascondono.
      if (èRigaDiServizio(riga.descrizione)) {
        righeDiServizio++;
        resoconto.push(`· ${riga.descrizione}: voce di servizio, non importata`);
        continue;
      }
      const unit = unitaDaFattura(riga.unitaMisura);
      // Lo stesso nome da due fornitori diversi sono due ingredienti diversi:
      // hanno prezzi diversi, ed è giusto poterli confrontare.
      const esistente = ingredienti.find(i =>
        i.name.trim().toLowerCase() === riga.descrizione.trim().toLowerCase() &&
        i.supplier === fornitore!.name);

      if (esistente) {
        const prezzoPrima = parseFloat(String(esistente.price)) || 0;
        traccia.aggiornati.push({
          id: esistente.id, prezzoPrima: esistente.price, unitaPrima: esistente.unit,
        });
        esistente.price = riga.prezzoUnitario;
        esistente.unit = unit;
        ingredientiAggiornati++;
        const variazione = prezzoPrima > 0
          ? ` (era ${soldiUnitari(prezzoPrima)}, ${riga.prezzoUnitario > prezzoPrima ? '+' : ''}${((riga.prezzoUnitario - prezzoPrima) / prezzoPrima * 100).toFixed(0)}%)`
          : '';
        resoconto.push(`↻ ${esistente.name} → ${soldiUnitari(riga.prezzoUnitario)}/${unit}${variazione}`);
      } else {
        const nuovo: Ingrediente = {
          id: nuovoId(), name: riga.descrizione, supplier: fornitore.name,
          unit, price: riga.prezzoUnitario, yieldPct: 100,
        };
        ingredienti.push(nuovo);
        creati.push(nuovo);
        traccia.creati.push(nuovo.id);
        ingredientiNuovi++;
        resoconto.push(`+ ${riga.descrizione} (${soldiUnitari(riga.prezzoUnitario)}/${unit})`);
      }
    }

    giaImportati.push(doc.id);
    storico.push(traccia);
  }

  return {
    fornitori, ingredienti, giaImportati, storico, creati, resoconto,
    fornitoriNuovi, ingredientiNuovi, ingredientiAggiornati,
    scartati, saltatiPerchéGiàImportati, righeDiServizio,
  };
}
