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


// ============================================================================
// LE FRASI, e perché stanno qui e non nella schermata.
//
// Comporre una frase da dei numeri sembra lavoro da schermata, e invece è la
// parte che si sbaglia: «1 posti scoperti» è un difetto che nessun controllo
// vede, e per accorgersene bisogna generare un prospetto che abbia esattamente
// un buco. Nella schermata quel codice non si può provare — Node non ha una
// pagina, e chi scrive `document.getElementById` fuori da un browser trova il
// vuoto. Qui invece si chiede: «con un posto scoperto cosa scrivi?».
//
// Restano fuori solo le tre righe che toccano davvero la pagina: prendere il
// riquadro, scriverci dentro, tenerlo chiuso. Quelle il DOM ce l'hanno per
// forza, ma non decidono niente.
//
// IL MARKUP È MINIMO E DICHIARATO: `<b>` per il numero che conta, `<i>` per un
// inciso, `<span class="come">` per il rimedio. Chi passa `evidenzia: false`
// riceve testo pulito — serve ai test e servirebbe a una stampa.
// ============================================================================

/**
 * Da dati a righe già scritte.
 *
 * @param {object} R    quello che restituisce `riepilogoGenerazione`.
 * @param {object} ctx  come si scrivono le cose: `t` per tradurre (se manca,
 *   italiano), `data` e `giornoMese` per le date, `nomeServizio` per i servizi,
 *   `esc` per rendere innocuo un nome che contiene `<`.
 * @returns {{gravi: string[], righe: string[], voci: string[]}}
 */
export function frasiRiepilogo(R, ctx = {}) {
  /* Il nome DEVE essere `t`: `controlla-lingue.cjs` cerca `t(` per raccogliere
     le frasi da tradurre, ed e' case-sensitive. Chiamandolo `T` — come avevo
     fatto — le frasi non finivano nei dizionari e nessuno se ne accorgeva: il
     riepilogo sarebbe restato in italiano anche in inglese e spagnolo, senza
     che nessun controllo lo dicesse.
     La sostituzione dei segnaposto si rifa' comunque dopo: `t` vero la fa gia',
     ma un traduttore finto (i test) no, e una frase con {n} a schermo e' peggio
     di una non tradotta. */
  const tradotto = ctx.t || (frase => frase);
  const t = (frase, valori) => sostituisci(tradotto(frase, valori), valori);
  const esc = ctx.esc || (x => String(x == null ? '' : x));
  const data = ctx.data || (x => String(x));
  const giornoMese = ctx.giornoMese || (x => String(x));
  const nomeServizio = ctx.nomeServizio || (x => String(x));
  const evidenzia = ctx.evidenzia !== false;
  const b = x => evidenzia ? `<b>${x}</b>` : String(x);
  const i = x => evidenzia ? `<i>${x}</i>` : String(x);

  const chi  = per => per.map(x => `${esc(x.nome)} (+${x.n})`).join(', ');
  const chiN = per => per.map(x => `${esc(x.nome)} (${x.n})`).join(', ');

  const gravi = [];
  const righe = [];

  if (R.scoperti.totale) {
    const dettaglio = R.scoperti.posti.map(p =>
      `${esc(data(p.giorno))} ${esc(nomeServizio(p.servizio))}·${p.stazione ? esc(p.stazione) : '—'}` +
      (p.mancano > 1 ? ` ×${p.mancano}` : '') +
      (p.rinunciatari.length
        ? ' ' + i(t('(extra spenti: {chi})', { chi: p.rinunciatari.map(esc).join(', ') }))
        : ''));
    gravi.push(b(R.scoperti.totale === 1
      ? t('1 posto scoperto') : t('{n} posti scoperti', { n: R.scoperti.totale })) +
      ' — ' + dettaglio.join(' · '));
    const rimedio = R.scoperti.conRinunciatari
      ? t('Per coprirli: riaccendi «può fare turni extra» a chi l’ha spento, aggiungi qualcuno su quella partita, o abbassa il fabbisogno.')
      : t('Per coprirli: aggiungi qualcuno su quella partita, o abbassa il fabbisogno.');
    gravi.push(evidenzia ? `<span class="come">${rimedio}</span>` : rimedio);
  }

  if (R.extra.totale) {
    righe.push((R.extra.totale === 1
      ? t('1 turno {extra} oltre quota', { extra: b(t('extra')) })
      : t('{n} turni {extra} oltre quota', { n: R.extra.totale, extra: b(t('extra')) })) +
      ' — ' + chi(R.extra.per));
  }

  if (R.eccedenze.totale) {
    // Restano distinte dagli extra: un extra costa in più, un'eccedenza è
    // dentro la quota ed è già pagata. Sommarle farebbe credere allo chef di
    // spendere soldi che ha già speso.
    const dove = R.eccedenze.suGiorniScelti
      ? t('sui giorni scelti') : t('dove il servizio preme');
    righe.push((R.eccedenze.totale === 1
      ? t('1 ora di contratto collocata {dove} (dentro quota, già pagata)', { dove })
      : t('{n} ore di contratto collocate {dove} (dentro quota, già pagate)',
          { n: R.eccedenze.totale, dove })) +
      ' — ' + chi(R.eccedenze.per));
  }

  if (R.senzaPartita.length) {
    righe.push(t('Senza turni perché senza partita — {chi}',
      { chi: R.senzaPartita.map(esc).join(', ') }));
  }

  if (R.quota.nonChiesta.totale) {
    righe.push(t('{n} turni di quota non assegnati, il fabbisogno non li chiedeva — {chi}',
      { n: R.quota.nonChiesta.totale, chi: chiN(R.quota.nonChiesta.per) }));
  }

  if (R.quota.aCavallo.totale) {
    // Questa NON è una cosa da sistemare, ed è l'unica riga che ha bisogno di
    // dirlo: lo chef aveva letto «43 turni non assegnati» su un mese e aveva
    // dovuto chiedere se erano i giorni mancanti. Erano quelli.
    righe.push(t('{n} turni appartengono a settimane che il periodo taglia: si assegnano generando anche i giorni mancanti',
      { n: R.quota.aCavallo.totale }));
  }

  if (R.settimaneSalte.length) {
    const quali = esc(R.settimaneSalte.map(giornoMese).join(', '));
    righe.push(R.settimaneSalte.length === 1
      ? t('Settimana del {quali} già completa, non rifatta', { quali })
      : t('Settimane del {quali} già complete, non rifatte', { quali }));
  }

  if (R.richieste.giorni) {
    righe.push(R.richieste.persone === 1
      ? t('{n} giorni vincolati da richieste approvate, su 1 persona — tutte rispettate',
          { n: R.richieste.giorni })
      : t('{n} giorni vincolati da richieste approvate, su {p} persone — tutte rispettate',
          { n: R.richieste.giorni, p: R.richieste.persone }));
  }

  if (R.altrove.giorni) {
    righe.push(t('{n} giorni liberi: lavorano in un’altra cucina ({cucine})',
      { n: R.altrove.giorni, cucine: R.altrove.cucine.map(esc).join(', ') }));
  }

  if (R.esplorazione) {
    righe.push(R.esplorazione.tuttiUguali
      ? t('{n} prospetti provati, tutti equivalenti: con queste quote, questo fabbisogno e queste richieste non c’è margine — è il meglio ottenibile',
          { n: R.esplorazione.bozze })
      : t('Il migliore di {n} prospetti provati', { n: R.esplorazione.bozze }));
  }

  if (R.tuttoBene) {
    righe.push('✓ ' + t('Fabbisogno coperto ovunque, senza turni extra'));
  }

  // ---- La riga corta in cima ------------------------------------------------
  // Gli STESSI numeri del dettaglio, presi da qui e non ricalcolati: due conti
  // per la stessa cosa divergono, ed è così che nasce «1 posto scoperto» quando
  // ne mancano tre. Il «!» davanti è come il componente riconosce cosa va letto
  // in rosso.
  const voci = [];
  if (R.scoperti.totale) {
    voci.push('!' + (R.scoperti.totale === 1
      ? t('1 posto scoperto') : t('{n} posti scoperti', { n: R.scoperti.totale })));
  }
  if (R.extra.totale) voci.push(t('{n} extra', { n: R.extra.totale }));
  if (R.eccedenze.totale) {
    voci.push(R.eccedenze.totale === 1
      ? t('1 ora collocata') : t('{n} ore collocate', { n: R.eccedenze.totale }));
  }
  if (R.senzaPartita.length) {
    voci.push(t('{n} senza partita', { n: R.senzaPartita.length }));
  }
  const inTasca = R.quota.nonChiesta.totale + R.quota.aCavallo.totale;
  if (inTasca) voci.push(t('{n} turni non assegnati', { n: inTasca }));

  return { gravi, righe, voci };
}

/* I segnaposto {cosi}. Quando `t` non c'è — nei test, o prima che la lingua sia
   caricata — le frasi restano in italiano e i valori vanno messi lo stesso. */
function sostituisci(frase, valori) {
  if (!valori) return frase;
  let out = String(frase);
  for (const [chiave, valore] of Object.entries(valori)) {
    out = out.split('{' + chiave + '}').join(String(valore));
  }
  return out;
}
