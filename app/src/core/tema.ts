// ============================================================================
// IL TEMA: automatico, chiaro, scuro.
//
// TRE STATI, non due. «Automatico» segue il telefono ed è quello di partenza:
// chi ha messo il telefono in chiaro alle otto di sera se lo ritrova chiaro
// anche qui, senza doverlo dire a un'app in più. Gli altri due sono una scelta
// esplicita, e una scelta esplicita vince sempre sul sistema.
//
// LA SCELTA È PER DISPOSITIVO, non per account, e sta in `localStorage`. È
// voluto: il tema dipende da DOVE stai guardando — il telefono in cucina con
// le luci accese e il portatile in ufficio la sera vogliono due cose diverse,
// e sono la stessa persona. Salvarlo sull'account lo renderebbe uguale su
// tutti e due.
//
// L'APPLICAZIONE VERA avviene PRIMA di questo modulo, in uno script minuscolo
// dentro <head>: i moduli ES sono differiti, e aspettarli vorrebbe dire un
// lampo di tema sbagliato a ogni apertura. Qui c'è il resto — leggere,
// cambiare, e dire com'è andata.
// ============================================================================

export type Tema = 'auto' | 'chiaro' | 'scuro';

const CHIAVE = 'comanda_tema';

export const TEMI: { valore: Tema; etichetta: string; simbolo: string }[] = [
  { valore: 'auto', etichetta: 'Automatico', simbolo: '◐' },
  { valore: 'chiaro', etichetta: 'Chiaro', simbolo: '☀' },
  { valore: 'scuro', etichetta: 'Scuro', simbolo: '☾' },
];

/** Cosa ha scelto chi usa l'app su QUESTO dispositivo. */
export function tema(): Tema {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (s === 'chiaro' || s === 'scuro' || s === 'auto') return s;
  } catch { /* browser che blocca lo storage: si resta su automatico */ }
  return 'auto';
}

/** Quale tema si sta vedendo ADESSO — con «auto» dipende dal sistema. */
export function temaEffettivo(): 'chiaro' | 'scuro' {
  const scelto = tema();
  if (scelto !== 'auto') return scelto;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'chiaro' : 'scuro';
}

/**
 * Applica un tema e lo ricorda. Con «auto» l'attributo si toglie del tutto:
 * senza attributo comandano le media query, che è esattamente cosa vuol dire
 * automatico.
 */
export function scegliTema(t: Tema): void {
  try { localStorage.setItem(CHIAVE, t); } catch { /* niente storage, pazienza */ }
  applica(t);
}

export function applica(t: Tema = tema()): void {
  const r = document.documentElement;
  if (t === 'auto') r.removeAttribute('data-tema');
  else r.setAttribute('data-tema', t);
  // La barra del browser sul telefono si tinge del colore del fondo: senza,
  // in tema chiaro resta una striscia scura in cima che sembra un difetto.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', temaEffettivo() === 'chiaro' ? '#faf7f0' : '#1d1b18');
}

/**
 * In «auto», se il sistema cambia mentre l'app è aperta, l'app cambia con lui.
 * Serve davvero: molti telefoni passano a scuro da soli al tramonto.
 */
export function seguiIlSistema(): void {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (tema() === 'auto') applica('auto');
  });
}
