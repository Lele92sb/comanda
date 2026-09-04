// ============================================================================
// QUANTO COSTA IL SERVIZIO, e quanto bisogna incassare per pagarselo.
//
// È la cosa che nessun concorrente può dire, e non per bravura: chi fa i turni
// (7shifts, HotSchedules) sa quanto costa il personale ma non cosa costi un
// piatto; chi fa il food cost (meez, Apicbase) sa cosa costa un piatto ma non
// sa cosa sia un turno. Hanno metà del conto e lo sanno. Qui ci sono tutte e
// due le metà, e il numero che ne esce è quello che uno chef si chiede il
// lunedì mattina: SABATO HO GUADAGNATO O NO?
//
// LA FORMULA DEL PAREGGIO. Se la merce si porta via il 30% dell'incasso e il
// personale di sabato costa 812 €, non basta incassare 812: di ogni euro che
// entra, 30 centesimi se ne vanno in merce. Serve I tale che
//
//     I − f·I ≥ L        cioè       I ≥ L / (1 − f)
//
// e con f = 0,30 e L = 812 fa 1.160 €. Chi somma e basta sbaglia di 348 €, e
// sbaglia sempre per difetto — cioè dalla parte che fa male.
//
// UN TOTALE INCOMPLETO NON È UN TOTALE. Se tre persone su otto non hanno la
// tariffa oraria, la somma è più bassa del vero e chi la legge prende una
// decisione su un numero falso. Quindi non si mostra un numero e basta: si
// dice CHI manca. Un conto che si dichiara incompleto è utile; uno che tace
// è peggio di nessun conto.
//
// Sta in `lib/` e non importa niente dell'app: gira dentro Node, ha i suoi
// test, e non sa cosa sia una schermata.
// ============================================================================

/**
 * Il costo del lavoro su un periodo.
 *
 * @param {object} p
 * @param {string[]} p.giorni     Date ISO del periodo, in ordine.
 * @param {object}   p.turni      { personaId: { 'AAAA-MM-GG': { code } } }
 * @param {Array}    p.persone    [{ id, name, costoOrario }]
 * @param {Function} p.oreDi      code → ore di quel tipo di turno
 */
export function costoDelLavoro({ giorni = [], turni = {}, persone = [], oreDi = () => 0 }){
  const perPersona = persone.map(p => {
    const suoi = turni[p.id] || {};
    const ore = giorni.reduce((n, g) => n + (oreDi((suoi[g] || {}).code || '') || 0), 0);
    const tariffa = numero(p.costoOrario);
    return {
      id: p.id,
      nome: p.name,
      ore,
      tariffa,
      costo: tariffa === null ? 0 : ore * tariffa,
      // Manca la tariffa SOLO se ha lavorato: chi non ha turni nel periodo non
      // rende incompleto niente, e segnalarlo sarebbe rumore che fa ignorare
      // anche le segnalazioni vere.
      manca: tariffa === null && ore > 0,
    };
  });

  const perGiorno = giorni.map(g => {
    let ore = 0, costo = 0, manca = false;
    for(const p of persone){
      const o = oreDi(((turni[p.id] || {})[g] || {}).code || '') || 0;
      if(!o) continue;
      ore += o;
      const tariffa = numero(p.costoOrario);
      if(tariffa === null) manca = true; else costo += o * tariffa;
    }
    return { giorno: g, ore, costo, completo: !manca };
  });

  const senzaTariffa = perPersona.filter(p => p.manca).map(p => p.nome);

  return {
    perGiorno,
    perPersona,
    ore:   perPersona.reduce((n, p) => n + p.ore, 0),
    costo: perPersona.reduce((n, p) => n + p.costo, 0),
    senzaTariffa,
    completo: senzaTariffa.length === 0,
  };
}

/**
 * Il food cost obiettivo MEDIO della cucina, in percentuale, o null.
 *
 * È la media dei piatti che un obiettivo ce l'hanno: chi non l'ha impostato
 * non vale zero — vale «non lo so», e contarlo come zero abbasserebbe la media
 * e gonfierebbe il pareggio verso il basso.
 */
export function foodCostMedio(piatti = []){
  const valori = piatti
    .map(p => numero(p.foodCostTargetPct))
    .filter(v => v !== null && v > 0 && v < 100);
  if(!valori.length) return null;
  return valori.reduce((a, b) => a + b, 0) / valori.length;
}

/**
 * Quanto bisogna incassare per coprire il costo del lavoro, tenuto conto che
 * una parte dell'incasso se ne va in merce.
 *
 * @param {number} costo         il costo del lavoro del periodo
 * @param {number|null} foodPct  il food cost obiettivo, in percentuale
 * @returns {number|null} l'incasso minimo, o null se non si può dire
 */
export function incassoDiPareggio(costo, foodPct){
  if(!(costo > 0)) return null;
  const f = numero(foodPct);
  // Senza food cost il conto non si fa. Restituire il costo secco sarebbe
  // peggio che non rispondere: sembrerebbe una risposta, e sarebbe quella
  // sbagliata di sicuro.
  if(f === null || f <= 0 || f >= 100) return null;
  return costo / (1 - f / 100);
}

/**
 * L'incidenza del costo del lavoro su un incasso, in percentuale.
 * È il numero con cui si confrontano due sabati diversi: 812 € su 3.000 e
 * 900 € su 4.000 non si confrontano a occhio, il 27% e il 22,5% sì.
 */
export function incidenza(costo, incasso){
  const i = numero(incasso);
  if(i === null || i <= 0) return null;
  return (costo / i) * 100;
}

/* Un campo di testo che è vuoto, o non è un numero, vale «non lo so» — e
   «non lo so» non è zero. Zero è una tariffa: vuol dire che quella persona non
   costa niente, ed è un'affermazione. */
function numero(v){
  if(v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
