// Controlla che ogni modulo importi i simboli che usa. La build non lo vede:
// un identificatore mancante è un errore che scoppia solo a runtime, davanti
// all'utente. È già successo tre volte oggi.
const fs = require('fs');
const path = require('path');

const elenca = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? elenca(path.join(d, e.name)) : [path.join(d, e.name)]);

const DA_CONTROLLARE = ['esc', 't', 'lingua', 'toast', 'save', 'state', 'uid', 'Cloud', 'conferma', 'chiediTesto'];
let problemi = 0;

for (const f of elenca('app/src').filter(x => /\.(js|ts)$/.test(x))) {
  const testo = fs.readFileSync(f, 'utf8');
  const corpo = testo.replace(/^import .*$/gm, '')
                     .replace(/\/\*[\s\S]*?\*\//g, ' ')
                     .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  for (const nome of DA_CONTROLLARE) {
    // "t" è una lettera sola e finisce ovunque: come parametro di una funzione
    // (tips.map(t => ...)) o dentro una stringa. Si conta solo quando viene
    // chiamata con un testo, che è l'unico modo in cui la usiamo davvero.
    const usato = nome === 't'
      ? /(^|[^\w.$])t\(\s*['"`]/.test(corpo)
      : new RegExp('(^|[^\\w.$])' + nome + '(\\s*\\(|[^\\w$])').test(corpo);
    if (!usato) continue;
    const importato = new RegExp('import\\s*\\{[^}]*\\b' + nome + '\\b[^}]*\\}').test(testo);
    const dichiarato = new RegExp('(function|const|let|var)\\s+' + nome + '\\b').test(testo);
    if (!importato && !dichiarato) {
      console.log('  MANCA "' + nome + '" in ' + f.replace(/\\/g, '/').replace('app/src/', ''));
      problemi++;
    }
  }
}
console.log(problemi ? problemi + ' simboli non importati' : 'tutti i moduli importano ciò che usano');
process.exit(problemi ? 1 : 0);
