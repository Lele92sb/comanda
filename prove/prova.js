// ============================================================================
// IL GUARDIANO DELLA CONSOLE
//
// Ogni prova di questa cartella importa `test` da qui e non da Playwright, e
// il motivo e' uno solo: cosi' il controllo non si puo' dimenticare.
//
// UN ReferenceError NON FERMA LA PAGINA. Ferma la funzione, a meta', e da li'
// in poi non gira piu' niente: la schermata resta com'era, senza un errore
// visibile. E' successo tre volte in questo repo (`html`, `grave`,
// `READONLY_ALLOWED`), e tutte e tre le volte la pagina sembrava a posto. In
// console invece l'errore c'e' sempre.
//
// Quindi: qualunque prova che apra una pagina fallisce se in console e'
// comparso un errore, anche se tutto quello che la prova voleva vedere c'era.
// Un controllo che bisogna ricordarsi di chiamare, prima o poi, non si chiama.
// ============================================================================

import { test as base, expect } from '@playwright/test';

/** Da dove arriva l'app quando gira in prova. */
const NOSTRO = 'http://localhost:4173';

/* I font stanno su Google, e se la rete non c'e' il browser scrive un errore
   in console. Non e' un difetto dell'app — l'app deve reggerlo, e lo regge con
   i font di sistema — quindi non deve far fallire una prova. Si guarda DA DOVE
   viene il messaggio, non cosa dice: filtrare per testo ("Failed to load
   resource") nasconderebbe anche un modulo nostro che non si carica. */
function eNostro(messaggio) {
  const url = messaggio.location()?.url ?? '';
  return url === '' || url.startsWith(NOSTRO);
}

export const test = base.extend({
  page: async ({ page }, usa) => {
    const guai = [];

    page.on('console', m => {
      if (m.type() === 'error' && eNostro(m)) guai.push('console — ' + m.text());
    });
    // Un'eccezione che nessuno ha raccolto: e' il ReferenceError a meta'
    // funzione. Non ha un url di terzi da filtrare, e' sempre nostra.
    page.on('pageerror', e => guai.push('eccezione — ' + (e.stack || e.message)));

    await usa(page);

    expect(guai,
      'La pagina ha scritto degli errori. Non importa se a schermo sembrava a posto:\n' +
      guai.join('\n')).toEqual([]);
  },
});

export { expect };
