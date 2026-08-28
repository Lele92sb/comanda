// ============================================================================
// Righe che non sono merce.
//
// Su una fattura di un fornitore alimentare non c'è solo cibo: trasporto,
// imballo, cauzione dei bancali, contributo CONAI, bolli, sconti. Importate
// come ingredienti diventano voci fantasma in anagrafica — e con l'import
// automatico se ne accumulano decine.
//
// Non vengono cancellate in silenzio: finiscono nel resoconto, così se il
// riconoscimento sbaglia lo chef se ne accorge e aggiunge la voce a mano.
// ============================================================================

/**
 * Parole che identificano una riga di servizio. Confrontate come parole
 * intere: "trasporto" non deve far scartare "trasportino per aragoste", e
 * "bollo" non deve toccare "bollito misto".
 */
const PAROLE_SERVIZIO = [
  'trasporto', 'trasporti', 'spedizione', 'consegna', 'porto',
  'imballo', 'imballaggio', 'imballaggi', 'cauzione', 'cauzionale',
  'bancale', 'bancali', 'pallet', 'cassa', 'casse',
  'conai', 'contributo', 'contributi',
  'bollo', 'bolli', 'sconto', 'sconti', 'abbuono', 'arrotondamento',
  'spese', 'commissione', 'commissioni', 'diritti',
  'acconto', 'saldo', 'anticipo',
];

/**
 * Espressioni composte da riconoscere per intero: "spese di trasporto" è
 * servizio, ma "spese" da sola dentro un nome di prodotto no.
 */
const ESPRESSIONI_SERVIZIO = [
  /spes[ae]\s+(di\s+)?(trasporto|spedizione|consegna|incasso)/,
  /contributo\s+conai/,
  /cauzione\s+/,
  /costi?\s+(di\s+)?(trasporto|imballo|consegna)/,
];

/**
 * Dice se una riga di fattura è una voce di servizio invece che merce.
 * Nel dubbio risponde false: importare per sbaglio un ingrediente vero è un
 * fastidio, scartare per sbaglio della merce fa sparire un costo dal food cost.
 */
export function èRigaDiServizio(descrizione: string): boolean {
  const testo = (descrizione || '').toLowerCase().trim();
  if (!testo) return false;

  for (const espressione of ESPRESSIONI_SERVIZIO) {
    if (espressione.test(testo)) return true;
  }

  // Una sola parola, ed è una parola di servizio: "Trasporto", "Imballo".
  const parole = testo.split(/[^a-zàèéìòùç]+/i).filter(Boolean);
  if (parole.length === 1 && parole[0] && PAROLE_SERVIZIO.includes(parole[0])) return true;

  // Due o tre parole quasi tutte di servizio: "Trasporto refrigerato",
  // "Contributo ambientale CONAI". Oltre le tre parole si tratta quasi sempre
  // di merce con una descrizione lunga, e non si tocca.
  if (parole.length >= 2 && parole.length <= 3) {
    const diServizio = parole.filter(p => PAROLE_SERVIZIO.includes(p)).length;
    if (diServizio >= 1 && diServizio >= parole.length - 1) return true;
  }

  return false;
}
