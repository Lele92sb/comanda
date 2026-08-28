// ============================================================================
// Raccolta degli errori dal browser (Cloudflare Pages Function, rotta /api/errori)
//
// Le segnalazioni finiscono in due posti:
//
//   1. i log di Cloudflare, come prima. Si leggono in diretta con
//      `wrangler pages deployment tail` e servono quando il database non è
//      raggiungibile — cioè proprio nel caso peggiore.
//   2. la tabella app_errors del database, che è quella che si può
//      interrogare: per versione, per cucina, per periodo, e raggruppata per
//      messaggio ricorrente. Un errore capitato di notte in una cucina, nei
//      log di Cloudflare, dopo un giorno non lo ritrova nessuno.
//
// Scrive con la CHIAVE DI SERVIZIO, perché app_errors non ha nessuna policy di
// inserimento: dal browser non ci si scrive nemmeno chiamando l'API a mano.
// Senza le variabili configurate resta il comportamento di prima, log e basta.
//
// COSA PASSA DI QUI: solo i campi dell'elenco qui sotto. Non è una
// precauzione teorica — è ciò che impedisce che una ricetta, un prezzo o un
// numero di telefono finiscano dentro un messaggio d'errore e da lì in una
// tabella che l'amministratore della piattaforma può leggere.
// ============================================================================

const MAX_CORPO = 4000;        // una segnalazione onesta sta in pochi KB

// Campo → quanti caratteri se ne tengono. L'elenco è chiuso: quello che il
// browser manda e non è qui dentro non arriva da nessuna parte.
const CAMPI = {
  messaggio: 300,
  origine:   200,
  versione:   20,
  browser:   200,
  ambiente:   20,
  cucina_id:  40,
  utente_id:  40,
};

// I nomi lato browser non coincidono con quelli della tabella: la traduzione
// sta qui, in un posto solo.
const DA_BROWSER = {
  messaggio: 'messaggio',
  origine:   'origine',
  versione:  'versione',
  browser:   'browser',
  ambiente:  'ambiente',
  cucina_id: 'cucinaId',
  utente_id: 'utenteId',
};

/** La riga da scrivere: solo i campi previsti, tagliati alla lunghezza prevista. */
export function riga(dati, paese) {
  const out = {};
  for (const [colonna, massimo] of Object.entries(CAMPI)) {
    const valore = dati[DA_BROWSER[colonna]];
    out[colonna] = valore == null ? '' : String(valore).slice(0, massimo);
  }
  // Gli identificativi vuoti vanno a null: una stringa vuota in una colonna
  // uuid non è un valore, è un errore di scrittura.
  for (const id of ['cucina_id', 'utente_id']) {
    if (!out[id]) out[id] = null;
  }
  out.paese = String(paese || '').slice(0, 8);
  return out;
}

export async function onRequestPost({ request, env }) {
  let dati;
  try {
    const testo = await request.text();
    if (testo.length > MAX_CORPO) return new Response(null, { status: 413 });
    dati = JSON.parse(testo);
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!dati || typeof dati.messaggio !== 'string') {
    return new Response(null, { status: 400 });
  }

  const r = riga(dati, request.headers.get('CF-IPCountry'));
  console.error('[errore-app]', JSON.stringify(r));

  if (env && env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
    try {
      const res = await fetch(env.SUPABASE_URL + '/rest/v1/app_errors', {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: 'Bearer ' + env.SUPABASE_SECRET_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(r),
      });
      if (!res.ok) console.error('[errore-app] scrittura non riuscita', res.status);
    } catch (e) {
      // La raccolta degli errori non deve mai diventare essa stessa una fonte
      // di errori: se il database non risponde resta il log, e chi sta usando
      // l'app non se ne accorge.
      console.error('[errore-app] database non raggiungibile', e);
    }
  }

  // Nessun corpo in risposta: al browser non serve, e una risposta vuota è
  // la più economica possibile.
  return new Response(null, { status: 204 });
}
