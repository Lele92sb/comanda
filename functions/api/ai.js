// ============================================================================
// Comanda — proxy per le funzioni AI (Cloudflare Pages Function, rotta /api/ai)
//
// Perché esiste: la chiave API di Anthropic non può stare nel browser, dove
// chiunque potrebbe leggerla e spenderci sopra. Il browser chiama questa
// funzione; questa funzione — e solo lei — conosce la chiave.
//
// Prima di inoltrare qualsiasi cosa verifica, in quest'ordine:
//   1. chi sta chiamando (token Supabase valido);
//   2. che sia davvero membro della cucina che dichiara;
//   3. che quella cucina non sia sospesa / in trial scaduto e non abbia
//      superato il tetto mensile di chiamate.
//
// Il client NON sceglie modello né limiti: li decide questo file, per task.
// Così una chiamata manipolata non può farsi costare quanto vuole.
//
// Variabili d'ambiente da impostare nella dashboard Cloudflare Pages:
//   SUPABASE_URL         — es. https://xxxx.supabase.co
//   SUPABASE_PUBLIC_KEY  — chiave "publishable" (sb_publishable_…) o la vecchia
//                          "anon": pubblica, serve a validare il token utente
//   SUPABASE_SECRET_KEY  — SEGRETA: chiave "secret" (sb_secret_…) o la vecchia
//                          "service_role". Scavalca tutte le policy: solo qui
//   ANTHROPIC_API_KEY    — SEGRETA: la chiave di fatturazione Anthropic
//   COMANDA_AI_MODEL     — opzionale, per cambiare modello senza toccare il codice
// ============================================================================

const DEFAULT_MODEL = 'claude-opus-5';

// Ogni funzione AI dell'app ha il suo profilo di costo. `effort: low` sulle due
// estrazioni strutturate: sono compiti meccanici, non serve farli ragionare a lungo.
const TASKS = {
  yield: { maxTokens: 8000,  effort: 'low' },    // stima resa ingredienti da fattura
  ocr:   { maxTokens: 8000,  effort: 'low' },    // lettura ricetta da foto
  chat:  { maxTokens: 16000, effort: 'medium' }, // assistente sous-chef
};

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json' },
});

export async function onRequestPost({ request, env }) {
  for(const name of ['SUPABASE_URL','SUPABASE_PUBLIC_KEY','SUPABASE_SECRET_KEY','ANTHROPIC_API_KEY']){
    if(!env[name]) return json({ error: 'Servizio AI non configurato (' + name + ' mancante).' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const kitchenId = request.headers.get('X-Kitchen-Id') || '';
  if(!token || !kitchenId) return json({ error: 'Richiesta non autenticata.' }, 401);

  let body;
  try{ body = await request.json(); }
  catch(e){ return json({ error: 'Richiesta non leggibile.' }, 400); }

  const profile = TASKS[body.task];
  if(!profile) return json({ error: 'Tipo di richiesta AI non riconosciuto.' }, 400);
  if(!Array.isArray(body.messages) || !body.messages.length){
    return json({ error: 'Nessun messaggio da inviare.' }, 400);
  }

  // 1. Chi sta chiamando: lo dice Supabase, non il client.
  const userRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_PUBLIC_KEY, Authorization: 'Bearer ' + token },
  });
  if(!userRes.ok) return json({ error: 'Sessione non valida, rientra con le tue credenziali.' }, 401);
  const user = await userRes.json();

  // 2. È membro di questa cucina?
  const admin = (path, init) => fetch(env.SUPABASE_URL + '/rest/v1' + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json',
      ...(init && init.headers),
    },
  });

  const memberRes = await admin(
    '/kitchen_members?select=role&user_id=eq.' + encodeURIComponent(user.id) +
    '&kitchen_id=eq.' + encodeURIComponent(kitchenId)
  );
  const members = memberRes.ok ? await memberRes.json() : [];
  if(!members.length) return json({ error: 'Non fai parte di questa cucina.' }, 403);

  // 3. Stato commerciale e tetto mensile, in un'unica operazione atomica.
  const quotaRes = await admin('/rpc/consume_ai_call', {
    method: 'POST',
    body: JSON.stringify({ p_kitchen: kitchenId }),
  });
  if(!quotaRes.ok) return json({ error: 'Controllo utilizzo non riuscito.' }, 502);
  const quota = await quotaRes.json();
  if(!quota.allowed){
    const reasons = {
      suspended:      'Questa cucina è sospesa: le funzioni AI sono disattivate.',
      trial_expired:  'Il periodo di prova è terminato: le funzioni AI sono disattivate.',
      quota_exceeded: 'Hai raggiunto il tetto di richieste AI di questo mese (' + quota.limit + ').',
    };
    return json({ error: reasons[quota.reason] || 'Funzioni AI non disponibili.' }, 403);
  }

  // 4. Inoltro ad Anthropic. Modello, limiti ed effort li decide il server.
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.COMANDA_AI_MODEL || DEFAULT_MODEL,
      max_tokens: profile.maxTokens,
      output_config: { effort: profile.effort },
      system: typeof body.system === 'string' ? body.system : undefined,
      messages: body.messages,
    }),
  });

  const result = await upstream.json().catch(()=>null);
  if(!upstream.ok){
    console.error('Anthropic error', upstream.status, result);
    // Il messaggio di errore a monte può contenere dettagli interni: non lo giriamo al browser.
    return json({ error: 'Il servizio AI non ha risposto correttamente. Riprova tra poco.' }, 502);
  }
  if(result && result.stop_reason === 'refusal'){
    return json({ error: 'La richiesta non è stata elaborata. Riformulala e riprova.' }, 422);
  }

  return json({ content: (result && result.content) || [] });
}
