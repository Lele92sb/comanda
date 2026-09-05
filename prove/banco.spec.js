// ============================================================================
// IL BANCO, APERTO DAVVERO
//
// Il banco dei componenti nasce con un `data-caso` su ogni riquadro, e nel suo
// file c'e' scritto a cosa serviva: «e' l'appiglio a cui si agganchera' un
// confronto automatico... manca il pezzo che scatta le foto». Questo e' quel
// pezzo, meno le foto.
//
// PERCHE' NON LE FOTO. Un confronto pixel fra il computer di chi lavora
// (Windows) e la pipeline (Linux) segnala differenze che non sono difetti: i
// caratteri si disegnano diversi. E un controllo che segnala il falso smette
// di essere letto — vale qui come vale per il confine di parola in lint:import.
// Quello che si controlla qui e' piu' grezzo e non sbaglia mai: la roba c'e' o
// non c'e', e la console tace o parla.
// ============================================================================

import { test, expect } from './prova.js';

/* Quanti casi ci si aspetta come minimo. Non il numero esatto — aggiungere un
   caso non deve far fallire una prova — ma un pavimento sotto cui vuol dire
   che il banco si e' fermato a meta' invece di disegnarsi tutto. */
const CASI_MINIMI = 60;

test.beforeEach(async ({ page }) => {
  await page.goto('/banco.html');
  await expect(page.locator('section.caso').first()).toBeVisible();
});

test('ogni caso del banco disegna qualcosa che si vede', async ({ page }) => {
  const casi = page.locator('section.caso');
  expect(await casi.count()).toBeGreaterThanOrEqual(CASI_MINIMI);

  /* Il criterio e' l'ALTEZZA, non il numero di figli. Un custom element che
     non si e' registrato — perche' il suo modulo e' esploso all'import — resta
     nel DOM come tag vuoto: i figli ci sono, ma alto zero. E' esattamente
     l'aspetto che aveva il riepilogo sparito. */
  const vuoti = await page.evaluate((n) => {
    const fuori = [];
    for (const s of document.querySelectorAll('section.caso')) {
      const palco = s.querySelector('.palco');
      const alto = palco ? palco.getBoundingClientRect().height : 0;
      if (alto < 1) fuori.push(s.getAttribute('data-caso') ?? '(senza nome)');
    }
    return fuori.slice(0, n);
  }, 20);
  expect(vuoti, 'Questi casi del banco non disegnano niente').toEqual([]);
});

test('ogni caso ha un nome, e i nomi non si ripetono', async ({ page }) => {
  // Due casi con lo stesso data-caso vuol dire che uno e' stato copiato e non
  // rinominato: da li' in poi ogni prova che lo cerca ne trova due, e passa
  // guardando quello sbagliato.
  const nomi = await page.$$eval('section.caso', s => s.map(x => x.getAttribute('data-caso')));
  expect(nomi.filter(n => !n)).toEqual([]);
  expect(nomi.length - new Set(nomi).size, 'Ci sono dei data-caso ripetuti').toBe(0);
});

test('il banco regge i due temi e la larghezza del telefono', async ({ page }) => {
  // Non c'e' un'asserzione sull'aspetto: quella la fa il contrasto, qui sotto.
  // Quello che si controlla e' che cambiare tema o larghezza non faccia
  // esplodere niente — il guardiano della console sta a guardare.
  for (const bottone of ['Chiaro', 'Scuro', 'Come il sistema']) {
    await page.getByRole('button', { name: bottone, exact: true }).click();
    await expect(page.locator('section.caso').first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Telefono 375' }).click();
  await expect(page.locator('.palco').first()).toBeVisible();
  await page.getByRole('button', { name: 'Largo' }).click();
});

test('il contrasto sta sopra soglia nei due temi', async ({ page }) => {
  /* La misura c'era gia' — `banco/contrasto.ts` e il bottone «Prova il
     contrasto» — ma bisognava premerlo a mano e leggersi il risultato. Qui lo
     preme la pipeline. Il primo giro a mano aveva trovato tre difetti veri
     (l'etichetta neutra bianca su bianco, il testo scuro sul rame scuro, i
     bordi degli avvisi scritti a mano): senza questa prova, il quarto lo
     trovera' di nuovo qualcuno per caso. */
  await page.getByRole('button', { name: 'Prova il contrasto' }).click();

  const esito = page.locator('.eco', { hasText: 'chiaro:' });
  await expect(esito).toBeVisible({ timeout: 15_000 });
  const testo = await esito.textContent();

  expect(testo, 'Dei testi sono sotto la soglia di contrasto').not.toContain('sotto soglia');
  expect(testo).toContain('chiaro:');
  expect(testo).toContain('scuro:');
});
