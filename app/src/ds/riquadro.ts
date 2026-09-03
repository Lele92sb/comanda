// ============================================================================
// <cmd-riquadro> — la superficie su cui sta un gruppo di cose.
//
// Sostituisce .panel, che era un rettangolo e basta: qui il titolo, i comandi
// del titolo e il contenuto hanno un posto dichiarato, quindi non possono
// allinearsi diversamente da un riquadro all'altro. Prima succedeva: lo stesso
// gruppo aveva il pulsante ora a destra del titolo, ora sotto.
//
// COMPRIMIBILE, e non e' un dettaglio. Il proprietario l'ha detto cosi':
// «per vedere i turni bisogna scorrere troppo, deve essere user friendly».
// Un riquadro che si chiude e si ricorda com'era e' il modo per tenere in
// pagina cose che servono ogni tanto senza farle costare mezzo schermo ogni
// giorno. L'altezza si anima davvero (grid-template-rows 0fr -> 1fr), che e'
// l'unico modo per farlo senza sapere in anticipo quanto e' alto il contenuto.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Riquadro extends Elemento {
  static override properties = {
    titolo: { type: String },
    sottotitolo: { type: String },
    comprimibile: { type: Boolean, reflect: true },
    aperto: { type: Boolean, reflect: true },
    piatto: { type: Boolean, reflect: true },
  };

  declare titolo: string;
  declare sottotitolo: string;
  declare comprimibile: boolean;
  /** Conta solo con `comprimibile`. Di partenza chiuso. */
  declare aperto: boolean;
  /** Senza fondo ne' bordo: quando il riquadro serve solo a raggruppare. */
  declare piatto: boolean;

  constructor() {
    super();
    this.titolo = '';
    this.sottotitolo = '';
    this.comprimibile = false;
    // CHIUSO di partenza, e conta solo se `comprimibile`: un riquadro che si
    // puo' chiudere ma nasce aperto non comprime niente — chi lo ha reso
    // comprimibile lo ha fatto perche' quel contenuto non serve subito.
    // I riquadri normali ignorano questo valore: il foglio di stile li tiene
    // aperti comunque (:host(:not([comprimibile])) .corpo).
    this.aperto = false;
    this.piatto = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;margin-bottom:var(--space-3);}
    .scatola{
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);
    }
    :host([piatto]) .scatola{background:none;border:0;padding:0;}

    header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3);}
    :host(:not([titolo])) header{display:none;}
    .testi{min-width:0;}
    h3{
      margin:0;font-family:var(--font-display);font-size:var(--text-lg);font-weight:600;
      color:var(--paper);overflow-wrap:anywhere;
    }
    .sotto{
      margin:var(--space-1) 0 0;font-family:var(--font-mono);font-size:var(--text-xs);
      letter-spacing:0.5px;color:var(--brass);line-height:1.6;
    }
    .azioni{display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;}

    /* Il titolo diventa il comando quando il riquadro si chiude: tutta la
       riga e' cliccabile, non solo la freccina da 12px. */
    .apri{
      all:unset;display:flex;align-items:center;gap:var(--space-2);
      cursor:pointer;flex:1;min-width:0;
      min-height:var(--tocco-min);
    }
    .freccia{
      flex:0 0 auto;color:var(--brass);font-size:11px;line-height:1;
      transition:transform var(--tempo-breve) var(--curva);
    }
    :host([aperto]) .freccia{transform:rotate(90deg);}

    /* Da 0fr a 1fr: e' il solo modo di animare l'altezza di un contenuto di cui
       non si conosce la misura. Con max-height si sceglie un numero a caso, e
       o taglia il contenuto lungo o rende lentissimo quello corto. */
    .corpo{
      display:grid;grid-template-rows:0fr;
      transition:grid-template-rows var(--tempo-lungo) var(--curva),
                 opacity var(--tempo-breve) var(--curva);
      opacity:0;
    }
    .corpo > div{overflow:hidden;min-height:0;}
    :host([aperto]) .corpo{grid-template-rows:1fr;opacity:1;}
    :host([titolo][aperto]) .corpo > div{padding-top:var(--space-3);}
    :host(:not([comprimibile])) .corpo{grid-template-rows:1fr;opacity:1;transition:none;}
  `];

  private inverti(): void {
    this.aperto = !this.aperto;
    this.emetti('cmd-apertura', { aperto: this.aperto });
  }

  override render(): TemplateResult {
    const testi = html`
      <div class="testi">
        <h3>${this.titolo}</h3>
        ${this.sottotitolo ? html`<p class="sotto">${this.sottotitolo}</p>` : nothing}
      </div>`;
    return html`
      <div class="scatola">
        <header>
          ${this.comprimibile
            ? html`<button class="apri" aria-expanded=${this.aperto ? 'true' : 'false'} @click=${this.inverti}>
                     <span class="freccia" aria-hidden="true">▶</span>${testi}
                   </button>`
            : testi}
          <div class="azioni"><slot name="azioni"></slot></div>
        </header>
        <div class="corpo"><div><slot></slot></div></div>
      </div>`;
  }
}

customElements.define('cmd-riquadro', Riquadro);

declare global {
  interface HTMLElementTagNameMap { 'cmd-riquadro': Riquadro }
}
