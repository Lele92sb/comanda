// ============================================================================
// Raccolta degli errori dal browser (Cloudflare Pages Function, rotta /api/errori)
//
// Per ora scrive nei log di Cloudflare, che si leggono dalla dashboard o con
// `wrangler pages deployment tail`. Basta per sapere cosa si rompe davvero.
//
// Quando il volume crescerà, questo è il punto in cui inoltrare a un servizio
// dedicato (Sentry o simili): cambia solo questo file, l'app non se ne accorge.
// ============================================================================

const MAX_CORPO = 4000;        // una segnalazione onesta sta in pochi KB

export async function onRequestPost({ request }) {
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

  // Si scrive solo ciò che serve a capire e a richiamare: nessun contenuto
  // della cucina passa di qui.
  console.error('[errore-app]', JSON.stringify({
    messaggio: String(dati.messaggio).slice(0, 300),
    origine: String(dati.origine || '').slice(0, 200),
    versione: String(dati.versione || '').slice(0, 20),
    browser: String(dati.browser || '').slice(0, 200),
    cucinaId: String(dati.cucinaId || '').slice(0, 40),
    utenteId: String(dati.utenteId || '').slice(0, 40),
    quando: String(dati.quando || '').slice(0, 30),
    // Da dove arriva: distingue la produzione dall'ambiente di prova.
    paese: request.headers.get('CF-IPCountry') || '',
  }));

  // Nessun corpo in risposta: al browser non serve, e una risposta vuota è
  // la più economica possibile.
  return new Response(null, { status: 204 });
}
