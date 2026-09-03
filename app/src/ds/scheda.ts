// ============================================================================
// <cmd-scheda> — una riga di elenco con dei comandi a destra.
//
// E' lo schema piu' ripetuto dell'app: la brigata, gli ingredienti, i
// fornitori, i piatti, le sub-ricette, i menu. Sei elenchi, sei volte lo stesso
// markup scritto a mano, e si erano gia' allontanati fra loro — in tre di
// questi i comandi stanno in colonna, negli altri in riga, e nessuno ha mai
// deciso che dovessero essere diversi.
//
// Non decide NIENTE del contenuto: nome, dettagli e comandi glieli si mettono
// dentro. Decide solo la forma — dove sta il nome, dove stanno i comandi, e che
// su uno schermo stretto i comandi scendono sotto invece di schiacciare il
// nome a due lettere.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Scheda extends Elemento {
  static override properties = {
    titolo: { type: String },
    /** Comandi in colonna a destra invece che in riga. Per elenchi con 3+ azioni. */
    incolonna: { type: Boolean, reflect: true },
  };

  declare titolo: string;
  declare incolonna: boolean;

  constructor() {
    super();
    this.titolo = '';
    this.incolonna = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;margin-bottom:var(--space-2);}
    .scatola{
      display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-3);
    }
    .dati{min-width:0;flex:1;}
    .titolo{
      display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-2);
      font-weight:600;font-size:var(--text-md);line-height:1.35;overflow-wrap:anywhere;
    }
    .azioni{display:flex;gap:var(--space-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}
    :host([incolonna]) .azioni{flex-direction:column;align-items:flex-end;}

    /* Sotto i 480px i comandi scendono: con due bottoni a destra il nome di un
       ingrediente si riduceva a «Aspar…» su un telefono. */
    @media(max-width:480px){
      .scatola{flex-direction:column;align-items:stretch;}
      .azioni{justify-content:flex-start;}
      :host([incolonna]) .azioni{flex-direction:row;align-items:stretch;}
    }
  `];

  override render(): TemplateResult {
    return html`
      <div class="scatola">
        <div class="dati">
          ${this.titolo
            ? html`<div class="titolo">${this.titolo}<slot name="stato"></slot></div>`
            : html`<div class="titolo"><slot name="titolo"></slot><slot name="stato"></slot></div>`}
          <slot></slot>
        </div>
        <div class="azioni"><slot name="azioni"></slot></div>
      </div>`;
  }
}

customElements.define('cmd-scheda', Scheda);

declare global {
  interface HTMLElementTagNameMap { 'cmd-scheda': Scheda }
}
