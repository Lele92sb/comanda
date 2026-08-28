// Valori che il costruttore inietta nel codice al momento della build
// (vedi `define` in vite.config.js). Senza questa dichiarazione il
// compilatore non sa che esistono.

/** Versione presa da package.json: la prima domanda quando un cliente segnala un problema. */
declare const __VERSIONE__: string;

/** Ambiente costruito: 'produzione' oppure 'test'. Deciso dal branch, non dall'indirizzo. */
declare const __AMBIENTE__: string;
