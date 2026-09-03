// ============================================================================
// IL CONTROLLO DEL CONTRASTO — la prima prova automatica dell'interfaccia.
//
// PERCHE' ESISTE. CLAUDE.md dice che i test non coprono l'interfaccia, e che le
// regressioni visive di questo progetto sono state trovate confrontando
// schermate a mano. Il confronto di schermate arrivera'; il contrasto invece
// non ha bisogno di aspettarlo, perche' non e' una questione di gusto: e' un
// numero, e o passa o non passa.
//
// Al primo giro, su 1357 pezzi di testo, ha trovato difetti veri che nessuno
// aveva notato in mesi:
//   - l'allarme dava 2,58:1 sul riquadro (ne servono 4,5);
//   - le etichette dei campi 3,73:1 — cioe' il testo che SPIEGA i campi era
//     il meno leggibile della pagina;
//   - il numero della comanda 3,16:1, e serve proprio a leggersi in fretta;
//   - sulla carta chiara, in tema scuro, il rame della categoria dava 3,27 e
//     la metrica «costo storto» 2,31: colori pensati per il fondo di ghisa,
//     appoggiati sulla carta.
//
// COME MISURA, e perche' i modi ovvi sbagliano:
//
//   1. IL FONDO NON E' QUELLO DELL'ELEMENTO. Quasi tutto e' trasparente: il
//      fondo vero e' il primo colore opaco che si trova risalendo, con sopra
//      tutti i colori semitrasparenti incontrati per strada, composti in
//      ordine. Un `rgba(...,0.18)` sopra un riquadro non e' quel colore: e'
//      quel colore mescolato al riquadro.
//
//   2. SI RISALE L'ALBERO APPIATTITO, non quello dei genitori. Un elemento
//      messo dentro uno slot si vede sul fondo dello SLOT, non su quello del
//      componente che l'ha scritto — per questo si guarda `assignedSlot`
//      prima di `parentElement`. La prima versione sbagliava proprio qui e
//      dichiarava settanta difetti che non esistevano: le voci di una ricetta
//      sembravano stare sul fondo scuro della pagina mentre stavano, giuste,
//      sulla carta chiara. Un controllo che grida al lupo lo si spegne, e
//      allora tanto vale non averlo.
//
//   3. LA SOGLIA DIPENDE DALLA MISURA. WCAG AA chiede 4,5:1, ma 3:1 basta per
//      il testo grande (24px, o 18,7px se grassetto): un carattere grosso si
//      legge anche con meno stacco.
//
// SI PUO' ROMPERE APPOSTA, ed e' il modo di fidarsene: cambia un token in
// qualcosa di illeggibile e questo deve accorgersene. Con `--brass` portato a
// #4a453c segnala 379 punti; rimesso a posto, zero.
// ============================================================================

export interface Difetto {
  dove: string;
  rapporto: number;
  soglia: number;
  colore: string;
  fondo: string;
  testo: string;
  volte: number;
}

export interface Esito {
  esaminati: number;
  sotto: number;
  difetti: Difetto[];
}

type Rgba = [number, number, number, number];

function leggi(colore: string): Rgba | null {
  const n = colore.match(/[\d.]+/g);
  if (!n || n.length < 3) return null;
  const [r, g, b, a] = n;
  return [+r!, +g!, +b!, a === undefined ? 1 : +a];
}

/** `sopra` steso su `sotto`: il colore che si vede davvero. */
function componi(sopra: Rgba, sotto: Rgba): Rgba {
  const a = sopra[3];
  return [
    sopra[0] * a + sotto[0] * (1 - a),
    sopra[1] * a + sotto[1] * (1 - a),
    sopra[2] * a + sotto[2] * (1 - a),
    1,
  ];
}

function luminosita(c: Rgba): number {
  const canale = (v: number): number => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canale(c[0]) + 0.7152 * canale(c[1]) + 0.0722 * canale(c[2]);
}

function rapporto(a: Rgba, b: Rgba): number {
  const la = luminosita(a), lb = luminosita(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Il pezzo sopra questo nell'albero APPIATTITO — vedi il punto 2 in cima. */
function sopraDi(el: Element): Element | null {
  const slot = (el as HTMLElement).assignedSlot;
  if (slot) return slot;
  if (el.parentElement) return el.parentElement;
  const radice = el.parentNode;
  return radice && (radice as ShadowRoot).host ? (radice as ShadowRoot).host : null;
}

function fondoDi(el: Element): Rgba {
  const strati: Rgba[] = [];
  let n: Element | null = el;
  while (n) {
    const c = leggi(getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0) { strati.push(c); if (c[3] === 1) break; }
    n = sopraDi(n);
  }
  // Se non si e' mai trovato un colore opaco si finisce sul bianco del
  // browser: e' cosi' che finisce davvero, non una supposizione.
  let base: Rgba = [255, 255, 255, 1];
  for (let i = strati.length - 1; i >= 0; i--) base = componi(strati[i]!, base);
  return base;
}

export function contrastoDi(el: Element): { rapporto: number; soglia: number; ok: boolean;
                                            colore: string; fondo: string } {
  const st = getComputedStyle(el);
  const testo = leggi(st.color) ?? [0, 0, 0, 1];
  const fondo = fondoDi(el);
  const px = parseFloat(st.fontSize);
  const grosso = px >= 24 || (px >= 18.66 && +st.fontWeight >= 700);
  const soglia = grosso ? 3 : 4.5;
  const r = rapporto(componi(testo, fondo), fondo);
  return {
    rapporto: Math.round(r * 100) / 100,
    soglia, ok: r >= soglia,
    colore: st.color,
    fondo: 'rgb(' + fondo.slice(0, 3).map(Math.round).join(',') + ')',
  };
}

/**
 * Passa tutto quello che disegna testo, shadow DOM compreso, e raccoglie
 * quello che non arriva alla soglia. Lo stesso difetto ripetuto in venti
 * schede resta UN difetto, con accanto quante volte compare: un elenco di
 * duecento righe uguali non lo legge nessuno.
 */
export function controllaContrasto(radice: ParentNode = document.body): Esito {
  const fuori: Omit<Difetto, 'volte'>[] = [];
  let esaminati = 0;

  const scendi = (dentro: ParentNode, via: string): void => {
    for (const el of Array.from(dentro.querySelectorAll('*'))) {
      if (el.shadowRoot) scendi(el.shadowRoot, via + '>' + el.tagName.toLowerCase());

      // Solo chi disegna testo PROPRIO: contare anche i contenitori vorrebbe
      // dire misurare venti volte lo stesso testo, una per ogni scatola che
      // lo racchiude.
      const suo = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim());
      if (!suo) continue;

      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) continue;

      const c = contrastoDi(el);
      esaminati++;
      if (c.ok) continue;

      const classe = typeof el.className === 'string' && el.className
        ? '.' + el.className.split(' ')[0] : '';
      fuori.push({
        dove: via + '>' + el.tagName.toLowerCase() + classe,
        rapporto: c.rapporto, soglia: c.soglia,
        colore: c.colore, fondo: c.fondo,
        testo: (el.textContent ?? '').trim().slice(0, 40),
      });
    }
  };
  scendi(radice, 'radice');

  const gruppi = new Map<string, Difetto>();
  for (const f of fuori) {
    const chiave = f.dove + '|' + f.rapporto;
    const g = gruppi.get(chiave);
    if (g) g.volte++; else gruppi.set(chiave, { ...f, volte: 1 });
  }

  return {
    esaminati,
    sotto: fuori.length,
    difetti: [...gruppi.values()].sort((a, b) => a.rapporto - b.rapporto),
  };
}
