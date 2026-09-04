/* ============================================================================
   I TOKEN INVENTATI: quelli che non esistono, e che nessun altro controllo vede.

   `var(--sfondo-rilievo)` non è un errore per nessuno. Non lo è per `tsc`, che
   non guarda dentro un template `css``. Non lo è per la build, che lo copia
   com'è. Non lo è per il browser, che quando un token non esiste non protesta:
   applica il valore iniziale della proprietà e va avanti. Il risultato è una
   schermata che si disegna, non dà errori, e ha le barre invisibili e le
   parole attaccate — e lo si scopre guardandola.

   È successo scrivendo `<cmd-costo-servizio>`: dieci token immaginati di sana
   pianta (`--sp-2`, `--testo-tenue`, `--accento`), tutti plausibili, nessuno
   esistente. Il componente compilava, la build passava, i test erano verdi.

   Quindi: ogni `var(--x)` deve trovare la sua `--x` in `ds/tokens.css`, oppure
   nel file stesso — un componente può dichiararsi le sue variabili interne — o
   fra quelle che il codice imposta a mano con `setProperty`, che sono valori
   calcolati e non decisioni visive.

       node scripts/controlla-token.cjs

   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..', 'app');
const TOKENS = path.join(RADICE, 'src', 'ds', 'tokens.css');

function tuttiIFile(dir, dentro = []){
  for(const voce of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, voce.name);
    if(voce.isDirectory()){ tuttiIFile(p, dentro); }
    else if(/\.(ts|js|css|html)$/.test(voce.name)){ dentro.push(p); }
  }
  return dentro;
}

function main(){
  if(!fs.existsSync(TOKENS)){
    console.error('non trovo ds/tokens.css'); process.exit(1);
  }
  const definiti = new Set(
    [...fs.readFileSync(TOKENS, 'utf8').matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)].map(m => m[1]));

  const problemi = [];
  for(const file of tuttiIFile(path.join(RADICE, 'src')).concat(
        fs.existsSync(path.join(RADICE, 'styles.css')) ? [path.join(RADICE, 'styles.css')] : [])){
    const testo = fs.readFileSync(file, 'utf8');
    // Quelli che il file si dichiara da sé, e quelli che imposta via JS.
    const locali = new Set([
      ...[...testo.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1]),
      ...[...testo.matchAll(/setProperty\(\s*['"`]--([a-z0-9-]+)/g)].map(m => m[1]),
    ]);
    for(const m of testo.matchAll(/var\(\s*--([a-z0-9-]+)/g)){
      const nome = m[1];
      if(definiti.has(nome) || locali.has(nome)) continue;
      const riga = testo.slice(0, m.index).split('\n').length;
      problemi.push(`${path.relative(RADICE, file).replace(/\\/g, '/')}:${riga}  var(--${nome})`);
    }
  }

  if(problemi.length){
    console.error(`\n${problemi.length} token che non esistono:\n`);
    for(const p of problemi) console.error('  ' + p);
    console.error(`\nO la decisione visiva sta già in ds/tokens.css con un altro nome,`);
    console.error(`o va aggiunta lì. Un colore scritto a mano dentro un componente è`);
    console.error(`una decisione presa in un posto in cui nessuno la cerchera'.\n`);
    process.exit(1);
  }
  console.log(`token a posto (${definiti.size} definiti in ds/tokens.css)`);
}

main();
