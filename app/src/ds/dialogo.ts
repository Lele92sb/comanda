// ============================================================================
// <cmd-dialogo> — la finestra che chiede qualcosa e aspetta.
//
// Sostituisce confirm() e prompt() del browser, che bloccano l'intera pagina,
// non seguono lo stile dell'app, non si traducono, e in alcuni contesti
// (anteprime, webview, iframe con restrizioni) vengono soppresse del tutto: il
// pulsante sembra semplicemente rotto.
//
// COSTRUITA SULL'ELEMENTO <dialog> NATIVO, e questa e' la differenza col
// riquadro fatto a mano che c'era prima. Con showModal() il browser regala tre
// cose che a mano si sbagliano quasi sempre:
//   - il FUOCO resta dentro: premendo Tab non si finisce sui comandi della
//     pagina sotto, che restano raggiungibili solo con lo sguardo;
//   - il resto della pagina diventa inerte per i lettori di schermo;
//   - Esc chiude, e il fuoco torna da solo dov'era prima di aprire.
// Il riquadro di prima aveva Esc scritto a mano e nient'altro.
//
// Il click FUORI chiude: quello va ancora fatto a mano, perche' il browser non
// distingue «ho premuto sullo sfondo» da «ho premuto sul bordo della finestra».
// Si confronta il punto premuto col rettangolo della finestra.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Dialogo extends Elemento {
  static override properties = {
    titolo: { type: String },
    aperto: { type: Boolean, reflect: true },
    /** Il click sullo sfondo non chiude: per le domande a cui si DEVE rispondere. */
    insistente: { type: Boolean },
  };

  declare titolo: string;
  declare aperto: boolean;
  declare insistente: boolean;

  constructor() {
    super();
    this.titolo = '';
    this.aperto = false;
    this.insistente = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:contents;}

    dialog{
      background:var(--bg-elev);color:var(--paper);
      border:1px solid var(--line-strong);border-radius:var(--radius-md);
      box-shadow:var(--shadow-float);
      max-width:420px;width:calc(100vw - 2 * var(--space-4));
      max-height:86vh;overflow:auto;
      padding:var(--space-4);
      font-family:var(--font-body);
    }
    /* Il fallback non e' pigrizia: ::backdrop sta nel top layer, e non
       tutti i browser gli fanno ereditare le variabili dell'elemento che
       lo genera. Senza, il velo sparirebbe del tutto. */
    dialog::backdrop{background:var(--velo, rgba(15,13,11,0.72));backdrop-filter:blur(3px);}

    @media (prefers-reduced-motion: no-preference){
      dialog[open]{animation:entra var(--tempo-breve) var(--curva);}
      @keyframes entra{from{opacity:0;transform:translateY(6px) scale(0.98);}}
    }

    h3{margin:0 0 var(--space-2);font-family:var(--font-display);
      font-size:var(--text-lg);font-weight:600;}
    .azioni{display:flex;gap:var(--space-2);margin-top:var(--space-4);}
    /* I comandi si dividono la riga: su un telefono due bottoni piccoli
       affiancati in mezzo allo schermo si sbagliano. */
    ::slotted([slot=azioni]){flex:1;}
  `];

  private get dialogo(): HTMLDialogElement | null {
    return this.renderRoot.querySelector('dialog');
  }

  override updated(cambi: Map<string, unknown>): void {
    if (!cambi.has('aperto')) return;
    const d = this.dialogo;
    if (!d) return;
    if (this.aperto && !d.open) d.showModal();
    if (!this.aperto && d.open) d.close();
  }

  private chiudi(): void {
    this.aperto = false;
    this.emetti('cmd-chiudi');
  }

  /* Il browser non sa distinguere lo sfondo dal bordo della finestra: il click
     arriva sempre sul <dialog>. Si guarda dove e' caduto rispetto al suo
     rettangolo. */
  private forse(e: MouseEvent): void {
    if (this.insistente) return;
    const d = this.dialogo;
    if (!d) return;
    const r = d.getBoundingClientRect();
    const dentro = e.clientX >= r.left && e.clientX <= r.right
                && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!dentro) this.chiudi();
  }

  override render(): TemplateResult {
    return html`
      <dialog
        aria-label=${this.titolo || nothing}
        @cancel=${(e: Event) => { e.preventDefault(); this.chiudi(); }}
        @click=${this.forse}
      >
        ${this.titolo ? html`<h3>${this.titolo}</h3>` : nothing}
        <slot></slot>
        <div class="azioni"><slot name="azioni"></slot></div>
      </dialog>`;
  }
}

customElements.define('cmd-dialogo', Dialogo);

declare global {
  interface HTMLElementTagNameMap { 'cmd-dialogo': Dialogo }
}
