// ============================================================================
// UNA REGOLA SOLA CHE CONTA: `no-undef`.
//
// Non è qui per lo stile — indentazione, virgolette e punti e virgola non
// interessano a nessuno e discuterne costa più di quanto valga. È qui per una
// cosa sola: il nome che non esiste.
//
// È SUCCESSO DUE VOLTE IN DUE GIORNI, e tutte e due le volte nello stesso modo:
// riscrivendo un blocco è rimasta una riga che usava una variabile appena
// eliminata — prima `html`, poi `grave`. Non è un errore di sintassi, quindi la
// build passa; `tsc` non guarda i `.js`; il controllo degli import verifica una
// lista di nomi noti e quelli erano variabili locali. Il risultato è un
// `ReferenceError` che parte a metà funzione: da lì in poi non gira più niente,
// e la schermata resta com'era. Nessun errore visibile, nessun controllo rosso.
// Se n'è accorto lo chef, usando l'app, due volte.
//
// PERCHÉ SOLO I `.js`. I `.ts` li controlla già `tsc`, che sa molto di più.
// Mettere ESLint anche lì vorrebbe dire un parser in più e due strumenti che
// dicono la stessa cosa.
//
// I GLOBALI SONO DICHIARATI, non indovinati: `no-undef` senza l'elenco di ciò
// che il browser mette a disposizione segnalerebbe `document` e `fetch` come
// errori, e un controllo che segnala il falso smette di essere letto — è già
// costato una volta, con `èRigaDiServizio`.
// ============================================================================
import globals from 'globals';

export default [
  {
    files: ['app/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Li sostituisce Vite al momento della build (`define` in
        // vite.config.js): nel sorgente non esistono, nel pacchetto sì.
        // Dichiararli qui è l'unico modo di non farli passare per errori —
        // e di continuare a segnalare quelli veri.
        __AMBIENTE__: 'readonly',
        __VERSIONE__: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      // Una variabile assegnata e mai letta è lo stesso sintomo dell'import
      // morto: quasi sempre vuol dire che qualcosa si è perso per strada.
      // Gli argomenti no: `(e, i) => ...` che ignora `i` è normale.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-undef': 'error' },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
