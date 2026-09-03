// ============================================================================
// <cmd-vuoto> — quando non c'e' ancora niente.
//
// Il vecchio .empty diceva «Nessuna stazione ancora.» dentro una cornice
// tratteggiata, e si fermava li'. Una schermata vuota e' invece il momento in
// cui una persona decide se l'app le serve: e' l'unica volta in cui legge
// davvero, perche' non c'e' altro da guardare.
//
// Quindi tre parti, e la terza e' quella che conta:
//   titolo    cosa manca
//   spiega    perche' serve, in una frase
//   azione    il primo passo, gia' pronto da premere
//
// Un vuoto senza il terzo pezzo e' un vicolo cieco con una scritta sopra.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Vuoto extends Elemento {
  static override properties = {
    titolo: { type: String },
    spiega: { type: String },
    simbolo: { type: String },
  };

  declare titolo: string;
  declare spiega: string;
  declare simbolo: string;

  constructor() {
    super();
    this.titolo = '';
    this.spiega = '';
    this.simbolo = '';
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;}
    .scatola{
      display:flex;flex-direction:column;align-items:center;text-align:center;
      gap:var(--space-2);
      border:1px dashed var(--line-strong);border-radius:var(--radius-md);
      padding:var(--space-5) var(--space-4);
    }
    .simbolo{font-size:26px;line-height:1;opacity:0.75;}
    h4{margin:0;font-family:var(--font-display);font-size:var(--text-lg);font-weight:600;color:var(--paper);}
    p{margin:0;max-width:44ch;font-size:var(--text-md);line-height:1.6;color:var(--brass);}
    .azione{margin-top:var(--space-2);}
    .azione::slotted(*){margin-top:var(--space-2);}
  `];

  override render(): TemplateResult {
    return html`
      <div class="scatola">
        ${this.simbolo ? html`<div class="simbolo" aria-hidden="true">${this.simbolo}</div>` : nothing}
        <h4>${this.titolo}</h4>
        ${this.spiega ? html`<p>${this.spiega}</p>` : nothing}
        <div class="azione"><slot></slot></div>
      </div>`;
  }
}

customElements.define('cmd-vuoto', Vuoto);

declare global {
  interface HTMLElementTagNameMap { 'cmd-vuoto': Vuoto }
}
