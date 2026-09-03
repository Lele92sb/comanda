// ============================================================================
// <cmd-interruttore> — una scelta sì/no che si spiega.
//
// Nel codice di oggi questo schema si chiama .riga-scelta, e il commento che
// lo accompagna dice la cosa giusta: «le impostazioni che cambiano cosa vedono
// gli altri meritano una frase, non solo un'etichetta».
//
// Il pezzo che cambia rispetto a una casella nuda: TUTTA LA RIGA e' il
// comando, titolo e spiegazione compresi. Una casella da 18px e' un bersaglio
// che si sbaglia col dito; una riga alta 60 no. E la spiegazione sta sotto il
// titolo, non dentro un punto interrogativo che nessuno preme.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Interruttore extends Elemento {
  static override properties = {
    acceso: { type: Boolean, reflect: true },
    titolo: { type: String },
    spiega: { type: String },
    disabilitato: { type: Boolean, reflect: true },
  };

  declare acceso: boolean;
  declare titolo: string;
  declare spiega: string;
  declare disabilitato: boolean;

  constructor() {
    super();
    this.acceso = false;
    this.titolo = '';
    this.spiega = '';
    this.disabilitato = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;}
    label{
      display:flex;gap:var(--space-3);align-items:flex-start;
      padding:var(--space-3) 0;border-bottom:1px solid var(--line);
      cursor:pointer;
    }
    :host([disabilitato]) label{opacity:0.5;cursor:default;}
    input{
      width:18px;height:18px;margin:2px 0 0;flex-shrink:0;
      accent-color:var(--copper);cursor:inherit;
    }
    .testi{min-width:0;}
    .titolo{display:block;font-size:var(--text-md);font-weight:600;line-height:1.4;}
    .spiega{
      display:block;
      font-family:var(--font-mono);font-size:11px;color:var(--brass);
      line-height:1.6;margin-top:3px;
    }
  `];

  private cambia(e: Event): void {
    this.acceso = (e.target as HTMLInputElement).checked;
    this.emetti('cmd-interruttore', { acceso: this.acceso });
  }

  override render(): TemplateResult {
    return html`
      <label>
        <input type="checkbox" .checked=${this.acceso}
               ?disabled=${this.disabilitato} @change=${this.cambia}>
        <span class="testi">
          <span class="titolo">${this.titolo}</span>
          ${this.spiega ? html`<span class="spiega">${this.spiega}</span>` : nothing}
        </span>
      </label>`;
  }
}

customElements.define('cmd-interruttore', Interruttore);

declare global {
  interface HTMLElementTagNameMap { 'cmd-interruttore': Interruttore }
}
