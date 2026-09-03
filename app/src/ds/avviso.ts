// ============================================================================
// <cmd-avviso> — una cosa da sapere prima di continuare.
//
// Sostituisce .alert-box e .ok-box, che erano due classi con le stesse
// misure e colori diversi. Qui sono un componente solo con un tono, perche'
// sono la stessa cosa che dice due cose diverse — e il giorno in cui il
// riempimento cambia, cambia in un posto.
//
// PERCHE' NON E' UN TOAST. Il toast in fondo allo schermo sparisce dopo due
// secondi: va bene per confermare («Salvato»), non per dire qualcosa che
// bisogna ancora fare. Un avviso resta finche' resta la ragione.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export type TonoAvviso = 'allarme' | 'ok' | 'nota';

export class Avviso extends Elemento {
  static override properties = {
    tono: { type: String, reflect: true },
    simbolo: { type: String },
  };

  declare tono: TonoAvviso;
  declare simbolo: string;

  constructor() {
    super();
    this.tono = 'nota';
    this.simbolo = '';
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;margin-bottom:var(--space-2);}
    .scatola{
      display:flex;gap:var(--space-2);align-items:flex-start;
      border-radius:var(--radius-md);padding:12px 14px;
      font-size:var(--text-md);line-height:1.55;
      background:var(--bg-elev2);border:1px solid var(--line);
    }
    :host([tono=allarme]) .scatola{background:var(--alert-soft);border-color:rgba(168,65,47,0.4);}
    :host([tono=ok]) .scatola{background:var(--sage-soft);border-color:rgba(107,128,100,0.4);}
    .simbolo{flex:0 0 auto;line-height:1.4;}
    .testo{min-width:0;overflow-wrap:anywhere;}
  `];

  override render(): TemplateResult {
    // Il simbolo di partenza dipende dal tono: chi scrive un avviso non deve
    // ricordarsi ogni volta quale spunta o quale triangolo va con quale colore.
    const simbolo = this.simbolo || (this.tono === 'allarme' ? '⚠' : this.tono === 'ok' ? '✓' : '');
    return html`
      <div class="scatola" role=${this.tono === 'allarme' ? 'alert' : 'status'}>
        ${simbolo ? html`<span class="simbolo" aria-hidden="true">${simbolo}</span>` : nothing}
        <span class="testo"><slot></slot></span>
      </div>`;
  }
}

customElements.define('cmd-avviso', Avviso);

declare global {
  interface HTMLElementTagNameMap { 'cmd-avviso': Avviso }
}
