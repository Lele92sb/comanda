// ============================================================================
// COM'È ANDATA LA GENERAZIONE, in dati e non in frasi.
//
// Questo modulo decide COSA c'è da dire dopo aver generato un prospetto: i
// posti scoperti, i turni extra, le ore collocate, le quote rimaste in tasca,
// e se valeva la pena cercare ancora. Non decide COME dirlo: niente frasi,
// niente plurali, niente HTML. Quelli stanno nel collante, dove c'è anche la
// lingua.
//
// STA QUI PER UN MOTIVO PRECISO, e il motivo è un errore. Questa logica viveva
// dentro `generatore.js`, cioè in un file che ha bisogno del DOM e quindi non
// può avere test. Riscrivendola ho lasciato una riga che usava una variabile
// appena eliminata: `ReferenceError` a metà funzione, e dopo ogni generazione
// non compariva più nessun messaggio. Nessuno dei cinque controlli l'ha visto,
// e l'ha trovato lo chef usando l'app.
//
// Dentro Node, invece, si può chiedere: «con tre posti scoperti su due giorni,
// cosa dici?» — e verificarlo prima che lo veda qualcuno.
//
// I CONTEGGI SONO LA PARTE CHE SI SBAGLIA. Un posto scoperto non è una riga di
// `shortfalls`: una riga può valerne tre, perché ha un campo `missing`. Contare
// le righe invece di sommare `missing` dà un numero più basso del vero — e più
// basso del vero, in un avviso, vuol dire che nessuno va a guardare.
// ============================================================================

/**
 * @param {object} esito  quello che restituisce il motore, più il contorno
 *   che il collante ha già calcolato (richieste, impegni altrove, settimane
 *   saltate).
 * @param {object} ctx    come si chiamano le cose: due funzioni di consultazione
 *   e la modalità dell'eccedenza. Nessun accesso a `state`.
 */
export function riepilogoGenerazione(esito = {}, ctx = {}) {
  const {
    shortfalls = [], extras = [], eccedenzeCollocate = [], nonPianificabili = [],
    quotaNonSpesa = [], settimaneSalte = [], nRichieste = 0, nPersoneRichieste = 0,
    altrove = {}, punteggio = null, bozzeProvate = 0, punteggioPeggiore = null,
  } = esito;

  const nomeStazione = ctx.nomeStazione || (id => id || null);
  const rinunciatari = ctx.rinunciatari || (() => []);
  const suGiorniScelti = Boolean(ctx.eccedenzaSuGiorniScelti);

  // ---- I posti scoperti ----------------------------------------------------
  // `missing` e non `length`: una riga sola può valere tre posti.
  const posti = shortfalls.map(sf => {
    const spenti = rinunciatari(sf) || [];
    return {
      giorno: sf.day,
      servizio: sf.service,
      stazione: nomeStazione(sf.stationId),
      mancano: sf.missing || 1,
      // Chi avrebbe potuto coprire ma ha spento «può fare turni extra»: è
      // l'unico caso in cui il buco si chiude parlando con una persona invece
      // che cambiando i numeri.
      rinunciatari: spenti,
    };
  });
  const scoperti = {
    totale: posti.reduce((n, p) => n + p.mancano, 0),
    posti,
    conRinunciatari: posti.filter(p => p.rinunciatari.length).length,
  };

  // ---- Chi, e quante volte -------------------------------------------------
  // Torna sempre ORDINATO per numero e poi per nome: due generazioni con gli
  // stessi dati devono dare la stessa riga, o chi rigenera per confrontare
  // legge differenze che non ci sono.
  const perTesta = (elenco, chiave) => {
    const conto = new Map();
    for (const x of elenco) conto.set(x[chiave], (conto.get(x[chiave]) || 0) + 1);
    return [...conto.entries()]
      .map(([nome, n]) => ({ nome, n }))
      .sort((a, b) => b.n - a.n || String(a.nome).localeCompare(String(b.nome), 'it'));
  };

  // ---- Le quote rimaste in tasca, per DUE motivi diversi --------------------
  // Confonderli costa tempo a chi legge: «il fabbisogno non li chiedeva» è una
  // decisione da prendere, «la settimana è tagliata dal periodo» si sistema da
  // sé generando il resto. Lo chef aveva letto «43 turni non assegnati» su un
  // mese e aveva dovuto chiedere se erano i giorni mancanti: erano quelli.
  const aCavallo = quotaNonSpesa.filter(q => q.motivo === 'settimana incompleta');
  const nonChiesta = quotaNonSpesa.filter(q => q.motivo !== 'settimana incompleta');
  const somma = g => g.reduce((n, q) => n + (q.turni || 0), 0);
  const elenco = g => g
    .map(q => ({ nome: q.staffName, n: q.turni || 0 }))
    .sort((a, b) => b.n - a.n || String(a.nome).localeCompare(String(b.nome), 'it'));

  // ---- Chi lavora in un'altra cucina ---------------------------------------
  const giorniAltrove = Object.values(altrove)
    .reduce((n, g) => n + Object.keys(g || {}).length, 0);
  const cucineAltrove = [...new Set(
    Object.values(altrove).flatMap(g => Object.values(g || {})))].sort();

  // ---- Si poteva fare di meglio? -------------------------------------------
  // Il motore disegna N bozze, ne aggiusta ognuna e tiene la migliore. Se la
  // peggiore e la migliore valgono uguale non c'era niente da esplorare: i
  // vincoli decidono tutto, e quel prospetto non è sfortunato — è l'unico che
  // le regole permettono. È la risposta alla domanda «con tutte le richieste
  // che ho messo, si poteva ottenere di meglio?».
  const esplorazione = (punteggio && bozzeProvate > 1)
    ? { bozze: bozzeProvate, tuttiUguali: punteggioPeggiore === punteggio.totale }
    : null;

  const r = {
    scoperti,
    extra: { totale: extras.length, per: perTesta(extras, 'staffName') },
    eccedenze: {
      totale: eccedenzeCollocate.length,
      per: perTesta(eccedenzeCollocate, 'staffName'),
      suGiorniScelti,
    },
    senzaPartita: nonPianificabili.map(x => x.staffName),
    quota: {
      nonChiesta: { totale: somma(nonChiesta), per: elenco(nonChiesta) },
      aCavallo: { totale: somma(aCavallo) },
    },
    settimaneSalte: settimaneSalte.slice(),
    richieste: { giorni: nRichieste, persone: nPersoneRichieste },
    altrove: { giorni: giorniAltrove, cucine: cucineAltrove },
    esplorazione,
  };

  // «Tutto bene» vuol dire che non c'è NIENTE da dire, non solo che il
  // fabbisogno è coperto: con due turni extra il fabbisogno è coperto, ma
  // qualcuno sta lavorando oltre la sua quota e va detto.
  r.tuttoBene = !r.scoperti.totale && !r.extra.totale && !r.eccedenze.totale
    && !r.senzaPartita.length && !r.quota.nonChiesta.totale && !r.quota.aCavallo.totale
    && !r.settimaneSalte.length && !r.altrove.giorni;

  return r;
}
