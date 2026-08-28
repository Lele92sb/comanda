import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

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
  define: { __VERSIONE__: JSON.stringify(version) },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Le mappe servono a leggere gli errori veri quando arriveranno dagli
    // utenti: senza, in produzione si vedono solo righe minificate.
    sourcemap: true,
  },
  server: { port: 4173 },
});
