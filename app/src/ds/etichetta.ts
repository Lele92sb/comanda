// ============================================================================
// <cmd-etichetta> — una parola che dice uno stato.
//
// «prezzo mancante», «resa stimata AI», «glutine», «pubblicato». Sono
// informazioni, non comandi: non si premono, e devono distinguersi dai chip,
// che invece si premono. Da qui la differenza di forma — l'etichetta e' piccola
// e piatta, il chip e' alto e ha un bordo.
//
// I TONI SONO TRE, e sono gli stessi tre significati che l'app usa ovunque:
//   neutro   un fatto
//   allarme  qualcosa manca o non va
//   ok       qualcosa e' a posto
// Non ce n'e' un quarto perche' non c'e' un quarto significato.
// ============================================================================
import { html, css, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export type TonoEtichetta = 'neutro' | 'allarme' | 'ok';

export class Etichetta extends Elemento {
  static override properties = {
    tono: { type: String, reflect: true },
  };

  declare tono: TonoEtichetta;

  constructor() {
    super();
    this.tono = 'neutro';
  }

  static override styles = [Elemento.styles, css`
    :host{display:inline-flex;vertical-align:middle;}
    span{
      display:inline-block;
      font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:0.3px;line-height:1.5;
      padding:3px 7px;border-radius:var(--radius-pill);
      background:var(--film);color:var(--paper-dim);
    }
    :host([tono=allarme]) span{background:var(--alert-soft);color:var(--alert);}
    :host([tono=ok]) span{background:var(--sage-soft);color:var(--sage);}
  `];

  override render(): TemplateResult {
    return html`<span><slot></slot></span>`;
  }
}

customElements.define('cmd-etichetta', Etichetta);

declare global {
  interface HTMLElementTagNameMap { 'cmd-etichetta': Etichetta }
}
