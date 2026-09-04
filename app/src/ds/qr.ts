// ============================================================================
// <cmd-qr> — un codice QR, disegnato come SVG.
//
// PERCHE' STA NEL DESIGN SYSTEM. Non sa niente di Comanda: riceve del testo e
// disegna dei quadratini. E' esattamente il genere di pezzo che il banco deve
// poter aprire da solo, e che un giorno si usera' anche per altro — il menu
// del giorno da appendere, la scheda di un piatto.
//
// E' l'unico componente di `ds/` che importa un pacchetto oltre a `lit`, e la
// ragione sta scritta nel guardiano dei confini: un QR non si scrive a mano.
// Dietro ci sono la codifica dei dati e la correzione d'errore Reed-Solomon, e
// un generatore scritto in casa e sbagliato non da' un QR brutto — da' un QR
// che la fotocamera non legge, e te ne accorgi in cucina con uno stagionale
// che non riesce a entrare.
//
// NON SEGUE IL TEMA, ed e' voluto. Un QR e' fatto per essere letto da una
// fotocamera, e le fotocamere si aspettano scuro su chiaro. Chiaro su scuro
// molti telefoni lo leggono, ma non tutti, e non c'e' modo di accorgersene
// prima che qualcuno resti fuori. Sta su carta bianca sempre, come
// <cmd-comanda>: e' l'altro punto dell'app dove il fondo non e' quello della
// pagina, e per la stessa ragione — quello che si guarda non e' uno schermo,
// e' una cosa da leggere.
//
// IL BORDO BIANCO INTORNO E' PARTE DEL CODICE. Si chiama «zona di quiete» e
// nello standard vale quattro moduli: senza, il lettore non trova dove
// comincia il disegno. Sembra un margine, non lo e'.
// ============================================================================
import { LitElement, html, svg, css, type TemplateResult } from 'lit';
import qr from 'qrcode-generator';

export class Qr extends LitElement {
  static override properties = {
    /** Il testo da codificare. Vuoto = non si disegna niente. */
    testo: { type: String },
    /** Il lato in pixel. Il disegno e' vettoriale: qui si decide solo quanto grande. */
    lato: { type: Number },
    /**
     * Cosa scrivere se il testo non ci sta in nessuna versione del formato.
     *
     * Arriva da FUORI perche' `ds/` non traduce: il design system non conosce
     * `core/lingua.ts` — e' la stessa ragione per cui <cmd-vuoto> riceve il
     * titolo invece di scriverselo. Un valore di partenza in italiano c'e'
     * lo stesso: meglio una frase leggibile che un riquadro muto, se chi usa
     * il componente si dimentica di passarla.
     */
    erroreTesto: { type: String },
  };

  declare testo: string;
  declare lato: number;
  declare erroreTesto: string;

  constructor() {
    super();
    this.testo = '';
    this.lato = 180;
    this.erroreTesto = 'Il codice è troppo lungo per un QR.';
  }

  static override styles = css`
    :host{display:inline-block;}
    .carta{
      background:#fff;border-radius:var(--radius-md);
      padding:10px;line-height:0;
      box-shadow:var(--shadow-card);
    }
    svg{display:block;}
    .rotto{
      font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.5;padding:var(--space-3);text-align:center;
    }
  `;

  override render(): TemplateResult {
    if (!this.testo) return html``;

    let g;
    try {
      // Versione 0 = la piu' piccola che ci sta, decisa dalla libreria in base
      // alla lunghezza. Correzione 'M': regge circa il 15% di disegno rovinato,
      // che e' quello che serve a un foglio appeso in cucina — si sporca, si
      // piega, prende gli schizzi.
      g = qr(0, 'M');
      g.addData(this.testo);
      g.make();
    } catch {
      // Un testo troppo lungo per qualunque versione. Non si disegna un QR
      // sbagliato: si dice che non c'e', e il link accanto resta comunque
      // copiabile.
      return html`<div class="rotto">${this.erroreTesto}</div>`;
    }

    const n = g.getModuleCount();
    // Le coordinate sono in MODULI e non in pixel: il viewBox scala tutto, e
    // cosi' il disegno resta netto a qualunque misura — su uno schermo, e
    // stampato.
    const quadretti = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (g.isDark(r, c)) quadretti.push(svg`<rect x=${c} y=${r} width="1" height="1"/>`);
      }
    }

    return html`
      <div class="carta">
        <svg width=${this.lato} height=${this.lato} viewBox="0 0 ${n} ${n}"
             role="img" aria-label=${this.testo}
             shape-rendering="crispEdges" fill="#000">
          ${quadretti}
        </svg>
      </div>`;
  }
}

customElements.define('cmd-qr', Qr);

declare global {
  interface HTMLElementTagNameMap { 'cmd-qr': Qr }
}
