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

const AMBIENTI = {
  produzione: {
    SUPABASE_URL: '',
    SUPABASE_PUBLIC_KEY: '',
  },
  test: {
    SUPABASE_URL: 'https://wkgmrklhxarnmtjysnws.supabase.co',
    SUPABASE_PUBLIC_KEY: 'sb_publishable_0X9X9YsH5PKfrq_mtXQl7w_j_2oKfjH',
  },
};

// L'ambiente è deciso al momento della COSTRUZIONE, dal branch che si sta
// pubblicando, e viene scritto dentro il codice (vedi `define` in
// vite.config.js). Non si indovina più dal nome dell'indirizzo.
//
// Prima si leggeva location.hostname e si cercava "staging." all'inizio.
// Ha funzionato per fortuna: quando Cloudflare ha assegnato al progetto un
// nome col suffisso, bastava che l'indirizzo cadesse diversamente perché
// l'app di prova si collegasse al database vero della cucina. Un dato
// scritto dal costruttore non può sbagliarsi così.
//
// In mancanza del valore si sceglie SEMPRE l'ambiente di test: se qualcosa va
// storto nella catena di pubblicazione, si finisce sul database di prova e
// non su quello dei clienti. L'errore costa una prova ripetuta, non dati veri
// mescolati a dati finti.
const ambiente = (typeof __AMBIENTE__ === 'string' && __AMBIENTE__ === 'produzione')
  ? 'produzione' : 'test';
const isTest = ambiente === 'test';

export const COMANDA_CONFIG = Object.assign(
  { IS_TEST: isTest, AMBIENTE: ambiente },
  AMBIENTI[ambiente]
);
