import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

// Quale ambiente si sta costruendo. Lo decide chi lancia la build — in
// pratica la pipeline, in base al branch. Senza valore si sceglie 'test':
// se qualcosa va storto nella catena, si finisce sul database di prova e non
// su quello dei clienti.
const ambiente = process.env['COMANDA_AMBIENTE'] === 'produzione' ? 'produzione' : 'test';

// L'app vive in app/ e viene costruita in dist/, che è quello che Cloudflare
// Pages pubblica. Le funzioni server restano in functions/ alla radice: è la
// convenzione di Pages e non passa da qui.
export default defineConfig({
  root: 'app',
  // Quello che sta in app/public finisce nella radice del sito così com'è:
  // icone e manifesto devono restare a un indirizzo fisso, perché il telefono
  // li cerca lì quando installi l'app.
  publicDir: 'public',
  // La versione finisce nel codice: quando un cliente segnala un problema,
  // la prima domanda è "quale versione stai usando".
  define: {
    __VERSIONE__: JSON.stringify(version),
    __AMBIENTE__: JSON.stringify(ambiente),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Due pagine, non una. banco.html e' il banco dei componenti: si apre a
    // /banco.html e mostra ogni pezzo del design system in ogni stato, senza
    // account, senza cucina e senza dati. Viene pubblicato con l'app apposta
    // — chi ci lavora deve poterlo aprire dove l'app gira davvero, non solo
    // sul proprio computer — e non pesa sull'app: e' un pacchetto separato,
    // che nessuno scarica finche' non apre quell'indirizzo.
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'app/index.html'),
        banco: resolve(__dirname, 'app/banco.html'),
      },
    },
    // Le mappe servono a leggere gli errori veri quando arriveranno dagli
    // utenti: senza, in produzione si vedono solo righe minificate.
    sourcemap: true,
  },
  server: { port: 4173 },
});
