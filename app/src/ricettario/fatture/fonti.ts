// ============================================================================
// Le FONTI da cui arrivano le fatture.
//
// Oggi ce n'è una sola: i file che lo chef scarica e carica a mano. Domani ce
// ne saranno altre — un gestionale collegato, o un intermediario che legge dal
// Sistema di Interscambio. Aggiungerne una significa scrivere un file qui
// dentro che rispetti FonteFatture: il resto dell'app non cambia di una riga.
//
// SUL COLLEGAMENTO DIRETTO AL CASSETTO FISCALE, prima che qualcuno ci provi:
// l'Agenzia delle Entrate non espone un'API che un'app possa chiamare per
// conto di un cliente. L'accesso a "Fatture e Corrispettivi" passa da SPID,
// CNS o credenziali Entratel della persona, oppure da una delega formale a un
// intermediario abilitato. Un prodotto che vuole leggere le fatture in
// automatico si appoggia quindi a un gestionale che le ha già (Fatture in
// Cloud, Aruba, TeamSystem...) oppure a un intermediario accreditato che
// espone una propria API. Le condizioni vanno verificate con il fornitore
// scelto: è materia regolamentata e cambia.
// ============================================================================
import { p7mArrayBufferToXmlText } from '../../lib/fatture-firmate.js';
import type { DocumentoFattura, FonteFatture } from './tipi.ts';

/**
 * Impronta del contenuto, usata come identificativo quando la fonte non ne
 * fornisce uno proprio. Serve a non reimportare due volte lo stesso documento
 * anche se il file viene rinominato.
 */
async function improntaDi(testo: string): Promise<string> {
  const dati = new TextEncoder().encode(testo);
  const digest = await crypto.subtle.digest('SHA-256', dati);
  return Array.from(new Uint8Array(digest)).slice(0, 12)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/** I file caricati a mano dallo chef: XML o XML firmato (.p7m). */
export function fonteFile(file: File[]): FonteFatture {
  return {
    id: 'file',
    nome: 'File caricati a mano',
    disponibile: () => true,
    async elenca(): Promise<DocumentoFattura[]> {
      const documenti: DocumentoFattura[] = [];
      for (const f of file) {
        let xml: string | null = null;
        try {
          if (/\.p7m$/i.test(f.name)) {
            // Firmato: il contenuto va estratto dalla struttura del file.
            xml = p7mArrayBufferToXmlText(await f.arrayBuffer());
          } else {
            xml = await f.text();
          }
        } catch {
          xml = null;
        }
        if (!xml) {
          // Documento illeggibile: entra comunque nell'elenco con XML vuoto,
          // così lo strato successivo lo conta fra gli scartati e lo dice allo
          // chef, invece di farlo sparire senza spiegazioni.
          documenti.push({ id: 'illeggibile:' + f.name, xml: '', etichetta: f.name });
          continue;
        }
        documenti.push({ id: await improntaDi(xml), xml, etichetta: f.name });
      }
      return documenti;
    },
  };
}

/**
 * Le fonti automatiche disponibili. Vuoto finché non se ne collega una: la
 * schermata mostra solo il caricamento a mano.
 *
 * Per aggiungerne una servono tre cose, nell'ordine:
 *   1. le credenziali del fornitore scelto, custodite lato server come la
 *      chiave AI — mai nel browser;
 *   2. una funzione server (functions/api/) che parli con quel fornitore,
 *      perché le sue credenziali non possono passare dal client;
 *   3. un file qui dentro che implementi FonteFatture chiamando quella
 *      funzione.
 */
export const fontiAutomatiche: FonteFatture[] = [];
