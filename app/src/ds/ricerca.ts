// ============================================================================
// <cmd-ricerca> — il campo per cercare dentro un elenco.
//
// UNO SOLO PER SEI ELENCHI. Ingredienti, piatti, sub-ricette, fornitori,
// brigata, menu: se ognuno avesse il suo, fra sei mesi cercherebbero in sei
// modi diversi, e chi impara a cercare fra gli ingredienti non troverebbe piu'
// niente fra i piatti.
//
// LA X NON E' UN VEZZO. Con l'elenco filtrato a due righe su trecento, l'unico
// modo di tornare indietro sarebbe cancellare a mano quello che si e' scritto —
// e su un telefono, con le mani unte, sono cinque tocchi. Compare solo quando
// c'e' qualcosa da cancellare.
//
// IL CONTEGGIO STA QUI e non nell'elenco. «3 di 128» risponde alla domanda che
// viene subito dopo aver scritto: ho trovato poco perche' c'e' poco, o perche'
// ho scritto male? Senza, un elenco corto e un elenco vuoto si somigliano
// troppo.
//
// Non e' `type=search`: il campo di ricerca nativo si porta dietro una X sua,
// diversa su ogni browser e impossibile da vestire, e su Safari pure una
// tendina di ricerche recenti che qui non ha senso.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';

export class Ricerca extends LitElement {
  static override properties = {
    valore: { type: String },
    segnaposto: { type: String },
    /** Quante voci si vedono adesso. Con `totale`, diventa «3 di 128». */
    quante: { type: Number },
    totale: { type: Number },
  };

  declare valore: string;
  declare segnaposto: string;
  declare quante: number;
  declare totale: number;

  constructor() {
    super();
    this.valore = '';
    this.segnaposto = '';
    this.quante = -1;
    this.totale = -1;
  }

  static override styles = css`
    :host{display:block;margin-bottom:var(--space-3);font-family:var(--font-body);}
    *,*::before,*::after{box-sizing:border-box;}

    .riga{display:flex;align-items:center;gap:var(--space-2);}

    .campo{
      position:relative;flex:1;min-width:0;
      display:flex;align-items:center;
    }
    /* La lente sta DENTRO il campo, non accanto: accanto sarebbe un'icona in
       piu' da capire, dentro dice cos'e' il campo senza bisogno di etichetta. */
    .lente{
      position:absolute;left:10px;pointer-events:none;
      font-size:var(--text-sm);color:var(--brass);line-height:1;
    }
    input{
      box-sizing:border-box;width:100%;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 34px 9px 30px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
      transition:border-color var(--tempo-istante) var(--curva);
    }
    input::placeholder{color:var(--brass);}
    input:hover{border-color:var(--brass);}
    input:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input{min-height:var(--tocco-min);} }

    .pulisci{
      position:absolute;right:4px;
      background:none;border:0;cursor:pointer;
      color:var(--brass);font-size:var(--text-md);line-height:1;
      width:28px;height:28px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
    }
    .pulisci:hover{color:var(--paper);background:var(--bg-elev);}
    .pulisci:focus-visible{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);}

    .conto{
      font-size:var(--text-sm);color:var(--brass);white-space:nowrap;flex-shrink:0;
    }
    .conto.niente{color:var(--alert);font-weight:600;}
  `;

  private manda(valore: string): void {
    this.dispatchEvent(new CustomEvent('cmd-ricerca', {
      detail: { valore }, bubbles: true, composed: true,
    }));
  }

  private pulisci(): void {
    this.valore = '';
    this.manda('');
    // Il fuoco torna nel campo: chi pulisce quasi sempre vuole riscrivere, e
    // rimandarlo a cercare il campo col dito sarebbe un passo di troppo.
    this.renderRoot.querySelector('input')?.focus();
  }

  override render(): TemplateResult {
    const conta = this.totale >= 0 && this.quante >= 0 && this.valore.trim() !== '';
    return html`
      <div class="riga">
        <div class="campo">
          <span class="lente" aria-hidden="true">⌕</span>
          <input type="text" .value=${this.valore}
                 placeholder=${this.segnaposto}
                 aria-label=${this.segnaposto}
                 autocomplete="off" spellcheck="false"
                 @input=${(e: Event) => {
                   this.valore = (e.target as HTMLInputElement).value;
                   this.manda(this.valore);
                 }}
                 @keydown=${(e: KeyboardEvent) => {
                   // Esc pulisce: e' quello che fa ogni campo di ricerca, e chi
                   // lo prova una volta poi lo usa sempre.
                   if (e.key === 'Escape' && this.valore) { e.stopPropagation(); this.pulisci(); }
                 }}>
          ${this.valore ? html`
            <button class="pulisci" type="button"
                    aria-label="Pulisci la ricerca"
                    @click=${this.pulisci}>✕</button>` : nothing}
        </div>
        ${conta ? html`
          <span class="conto ${this.quante === 0 ? 'niente' : ''}"
                aria-live="polite">${this.quante} / ${this.totale}</span>` : nothing}
      </div>`;
  }
}

customElements.define('cmd-ricerca', Ricerca);

declare global {
  interface HTMLElementTagNameMap { 'cmd-ricerca': Ricerca }
}
