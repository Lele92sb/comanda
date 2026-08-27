// ============================================================================
// Comanda — configurazione degli ambienti.
//
// Finché i campi di un ambiente sono vuoti, lì l'app funziona in MODALITÀ
// LOCALE: come la prima versione, dati salvati solo nel browser di questo
// dispositivo, nessun account. Serve a poter continuare a usare e provare
// l'app mentre il lato cloud non è ancora configurato.
//
// Appena inserisci URL e chiave del progetto Supabase, quell'ambiente passa in
// MODALITÀ CLOUD: login, cucine condivise, ruoli, funzioni AI.
//
// PRODUZIONE e TEST vanno su DUE PROGETTI SUPABASE DIVERSI. È la separazione
// che conta davvero: i dati veri della cucina e quelli di prova finiscono in
// due database distinti, quindi non possono mescolarsi per errore.
//
// SUPABASE_PUBLIC_KEY è la chiave "publishable" (sb_publishable_...), o la
// vecchia "anon" nei progetti più datati. È pubblica per definizione — è
// pensata per stare nel browser — quindi può stare in questo file versionato.
// A proteggere i dati sono le policy RLS in supabase/schema.sql, non questa
// chiave. La chiave davvero segreta (secret / service_role) sta solo lato
// server, nelle variabili d'ambiente di Cloudflare — mai qui.
// ============================================================================
(function(){
  const AMBIENTI = {
    produzione: {
      SUPABASE_URL: '',
      SUPABASE_PUBLIC_KEY: '',
    },
    test: {
      SUPABASE_URL: '',
      SUPABASE_PUBLIC_KEY: '',
    },
  };

  const host = location.hostname;
  const isTest =
    /^staging\./.test(host) ||                 // deploy del branch staging su Cloudflare Pages
    location.pathname.includes('/staging/') ||  // schema a sottocartella (GitHub Pages)
    host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';

  window.COMANDA_CONFIG = Object.assign(
    { IS_TEST: isTest },
    isTest ? AMBIENTI.test : AMBIENTI.produzione
  );
})();
