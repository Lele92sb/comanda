// ============================================================================
// <cmd-campo> — etichetta, controllo, aiuto, errore.
//
// NON POSSIEDE IL CONTROLLO: quello glielo si mette dentro.
//     <cmd-campo etichetta="Nome della partita">
//       <input type="text" .value=...>
//     </cmd-campo>
// Cosi' vale per input, textarea, select, color e per i controlli nostri,
// senza che questo componente debba conoscerli. Un campo che possedesse il
// proprio input dovrebbe reimplementare, uno per uno, dieci comportamenti che
// il browser fa gia' bene (composizione da tastiera cinese, riempimento
// automatico, correttore, data di sistema).
//
// QUELLO CHE FA, E CHE PRIMA NON FACEVA NESSUNO:
//
// 1. LEGA L'ETICHETTA AL CONTROLLO. Nel markup di oggi le <label> sono quasi
//    tutte scollegate: sono lì sopra e basta. Chi usa un lettore di schermo
//    sente «casella di testo» e nient'altro, e chi tocca l'etichetta col dito
//    non attiva il campo. Qui il legame si fa da solo, e non si puo' scordare.
// 2. COLLEGA L'AIUTO E L'ERRORE. aria-describedby e aria-invalid, sempre,
//    senza doverci pensare.
// 3. L'ERRORE STA SOTTO IL CAMPO, non in un toast in fondo allo schermo che
//    sparisce dopo due secondi mentre chi scrive sta ancora guardando il campo.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

let progressivo = 0;

export class Campo extends Elemento {
  static override properties = {
    etichetta: { type: String },
    aiuto: { type: String },
    errore: { type: String, reflect: true },
    obbligatorio: { type: Boolean, reflect: true },
    orizzontale: { type: Boolean, reflect: true },
  };

  declare etichetta: string;
  /** Una frase che spiega, sempre visibile. Non e' un errore. */
  declare aiuto: string;
  /** Se valorizzato, il campo si segna come sbagliato e mostra questo testo. */
  declare errore: string;
  declare obbligatorio: boolean;
  /** Etichetta a fianco invece che sopra: per le righe fitte (una tabella). */
  declare orizzontale: boolean;

  private readonly idBase = 'campo-' + (++progressivo);

  constructor() {
    super();
    this.etichetta = '';
    this.aiuto = '';
    this.errore = '';
    this.obbligatorio = false;
    this.orizzontale = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;margin-bottom:var(--space-3);}
    :host([orizzontale]) .campo{display:flex;align-items:center;gap:var(--space-3);}
    :host([orizzontale]) label{margin:0;flex:0 0 auto;}
    :host([orizzontale]) .controllo{flex:1;min-width:0;}

    label{
      display:block;font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);
      margin:0 0 var(--space-1);cursor:pointer;
    }
    .stella{color:var(--copper-light);margin-left:3px;}

    /* I controlli nativi che vengono messi dentro prendono l'aspetto dell'app
       da qui. E' l'unico punto in cui succede: quando tutte le schermate
       saranno passate da cmd-campo, la regola gemella in styles.css si potra'
       cancellare, e i campi avranno UN aspetto solo invece di due che si
       somigliano finche' qualcuno non ne tocca uno. */
    ::slotted(input),::slotted(textarea),::slotted(select){
      width:100%;
      background:var(--bg-elev2);
      border:1px solid var(--line-strong);
      color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
      transition:border-color var(--tempo-istante) var(--curva);
    }
    @media (pointer:coarse){
      ::slotted(input),::slotted(textarea),::slotted(select){min-height:var(--tocco-min);}
    }
    ::slotted(input:hover),::slotted(textarea:hover),::slotted(select:hover){border-color:var(--brass);}
    ::slotted(input:focus),::slotted(textarea:focus),::slotted(select:focus){
      outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);
    }
    ::slotted(textarea){resize:vertical;min-height:70px;}
    :host([errore]) ::slotted(input),
    :host([errore]) ::slotted(textarea),
    :host([errore]) ::slotted(select){border-color:var(--alert);}

    .aiuto,.errore{
      margin:var(--space-1) 0 0;font-family:var(--font-mono);font-size:var(--text-xs);
      line-height:1.6;
    }
    .aiuto{color:var(--brass);}
    .errore{color:var(--alert);}
  `];

  /* Il legame etichetta-controllo si fa qui, quando il contenuto entra. Farlo
     nel render non basterebbe: lo slot si riempie dopo, e il controllo che si
     cerca non c'e' ancora. */
  private collega(e: Event): void {
    const slot = e.target as HTMLSlotElement;
    const dentro = slot.assignedElements({ flatten: true })
      .find(x => x.matches('input,textarea,select,[role=combobox],[tabindex]'));
    if (!dentro) return;
    if (!dentro.id) dentro.id = this.idBase + '-controllo';
    const lab = this.renderRoot.querySelector('label');
    if (lab) lab.setAttribute('for', dentro.id);
    const descrizioni = [
      this.aiuto ? this.idBase + '-aiuto' : '',
      this.errore ? this.idBase + '-errore' : '',
    ].filter(Boolean).join(' ');
    if (descrizioni) dentro.setAttribute('aria-describedby', descrizioni);
    else dentro.removeAttribute('aria-describedby');
    if (this.errore) dentro.setAttribute('aria-invalid', 'true');
    else dentro.removeAttribute('aria-invalid');
    if (this.obbligatorio) dentro.setAttribute('required', '');
  }

  override updated(): void {
    // aiuto ed errore cambiano dopo il primo aggancio: il collegamento va
    // rifatto, altrimenti aria-describedby punta a un id che non c'e' piu'.
    const slot = this.renderRoot.querySelector('slot');
    if (slot) this.collega({ target: slot } as unknown as Event);
  }

  override render(): TemplateResult {
    return html`
      <div class="campo">
        ${this.etichetta
          ? html`<label>${this.etichetta}${this.obbligatorio
                  ? html`<span class="stella" aria-hidden="true">*</span>` : nothing}</label>`
          : nothing}
        <div class="controllo"><slot @slotchange=${this.collega}></slot></div>
        ${this.aiuto ? html`<p class="aiuto" id="${this.idBase}-aiuto">${this.aiuto}</p>` : nothing}
        ${this.errore
          ? html`<p class="errore" id="${this.idBase}-errore" role="alert">${this.errore}</p>`
          : nothing}
      </div>`;
  }
}

customElements.define('cmd-campo', Campo);

declare global {
  interface HTMLElementTagNameMap { 'cmd-campo': Campo }
}
