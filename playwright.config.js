// ============================================================================
// LE PROVE SUI CLIC — la classe di errori che i 283 test non possono vedere.
//
// PERCHE' ESISTE QUESTO FILE. Gli ultimi difetti veri di questa app non erano
// di logica: il chip che si accendeva da solo, il riquadro che si richiudeva
// sotto le mani, il riepilogo che non compariva piu' per un ReferenceError a
// meta' funzione. Nessuno dei 283 test poteva vederli — Node non ha una
// pagina — e li ha trovati lo chef usando l'app in cucina.
//
// Qui si apre un browser vero, si clicca, e si guarda cosa succede.
//
// UNA SOLA PORTA. Le prove girano contro `npm run dev`, cioe' la stessa cosa
// che si apre a mano. Se un server e' gia' in piedi lo riusa: chi sta
// lavorando col dev aperto non deve chiuderlo per lanciare le prove.
// ============================================================================

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './prove',
  // Un fallimento va riprodotto, non ritentato finche' passa: un ritentativo
  // automatico trasforma un difetto vero in un difetto "che capita ogni tanto",
  // e quelli non li guarda piu' nessuno.
  retries: 0,
  // In CI nessuno guarda il browser: senza schermo e' piu' veloce e non serve
  // un server grafico.
  use: {
    baseURL: 'http://localhost:4173',
    // La traccia solo quando qualcosa e' andato storto: e' un filmato dei clic
    // con il DOM a ogni passo, e si apre con `npx playwright show-trace`.
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 4173,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
});
