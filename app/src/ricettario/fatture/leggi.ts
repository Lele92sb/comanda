// ============================================================================
// Da XML FatturaPA a dati utilizzabili.
//
// Funzione pura: nessun DOM, nessuno stato, nessun salvataggio. È così che
// diventa testabile in Node — e va testata, perché da qui escono i PREZZI su
// cui si calcola il food cost e quindi il prezzo dei piatti in menu. Un errore
// qui non si vede: produce solo un margine sbagliato.
//
// Prima usava DOMParser, disponibile solo nel browser: la stessa logica non si
// poteva verificare senza aprire una pagina.
// ============================================================================
import { XMLParser } from 'fast-xml-parser';
import type { FatturaLetta, RigaFattura } from './tipi.ts';

const parser = new XMLParser({
  // Le FatturaPA arrivano con prefissi di namespace variabili (p:, ns2:, o
  // nessuno) a seconda di chi le ha emesse: toglierli evita di inseguirli.
  removeNSPrefix: true,
  ignoreAttributes: true,
  // I codici articolo e le partite IVA sono numerici ma vanno trattati come
  // testo: "01234" non deve diventare 1234.
  parseTagValue: false,
  trimValues: true,
});

const testo = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

/** I numeri in FatturaPA usano il punto decimale, ma non fidiamoci. */
function numero(v: unknown): number {
  const n = parseFloat(testo(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Un tag ripetuto arriva come array, uno solo come oggetto: qui sempre array. */
function comeElenco<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function leggiFatturaXML(xml: string): FatturaLetta | null {
  let doc: Record<string, any>;
  try {
    doc = parser.parse(xml) as Record<string, any>;
  } catch {
    return null;
  }

  const radice = doc?.['FatturaElettronica'];
  if (!radice) return null;

  const cedente = radice?.['FatturaElettronicaHeader']?.['CedentePrestatore'];
  if (!cedente) return null;

  const anagrafica = cedente?.['DatiAnagrafici']?.['Anagrafica'] ?? {};
  const nome =
    testo(anagrafica['Denominazione']) ||
    [testo(anagrafica['Nome']), testo(anagrafica['Cognome'])].filter(Boolean).join(' ');
  if (!nome) return null;

  const sede = cedente['Sede'] ?? {};
  const contatti = cedente['Contatti'] ?? {};

  // Una fattura può contenere più corpi (più documenti nello stesso file).
  const corpi = comeElenco<Record<string, any>>(radice['FatturaElettronicaBody']);
  const righe: RigaFattura[] = [];
  let numeroDoc = '';
  let dataDoc = '';

  for (const corpo of corpi) {
    const generali = corpo?.['DatiGenerali']?.['DatiGeneraliDocumento'] ?? {};
    if (!numeroDoc) numeroDoc = testo(generali['Numero']);
    if (!dataDoc) dataDoc = testo(generali['Data']);

    for (const linea of comeElenco<Record<string, any>>(corpo?.['DatiBeniServizi']?.['DettaglioLinee'])) {
      const descrizione = testo(linea['Descrizione']);
      if (!descrizione) continue;
      righe.push({
        descrizione,
        // Quantità assente vuol dire "una unità": è il caso dei servizi.
        quantita: linea['Quantita'] !== undefined ? numero(linea['Quantita']) : 1,
        unitaMisura: testo(linea['UnitaMisura']),
        prezzoUnitario: numero(linea['PrezzoUnitario']),
      });
    }
  }

  return {
    fornitore: {
      nome,
      piva: testo(cedente?.['DatiAnagrafici']?.['IdFiscaleIVA']?.['IdCodice']),
      telefono: testo(contatti['Telefono']),
      email: testo(contatti['Email']),
      indirizzo: [sede['Indirizzo'], sede['CAP'], sede['Comune'], sede['Provincia']]
        .map(testo).filter(Boolean).join(' - '),
    },
    righe,
    numero: numeroDoc,
    data: dataDoc,
  };
}

/**
 * L'unità di misura sulle fatture è libera: "KG", "Kg.", "LT", "NR", "PZ",
 * "CT"... Qui si riduce alle tre che l'app sa gestire.
 */
export function unitaDaFattura(um: string): 'kg' | 'l' | 'pz' {
  const u = (um || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (u.includes('KG') || u === 'CHILO' || u === 'CHILI') return 'kg';
  if (u.includes('LT') || u === 'L' || u.includes('LITR')) return 'l';
  return 'pz';
}
