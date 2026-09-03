// ============================================================================
// <cmd-scelta> — la tendina.
//
// PERCHE' RIFARE UNA COSA CHE IL BROWSER HA GIA'
//
// Il <select> nativo e' l'unico pezzo di interfaccia che il browser disegna
// col suo aspetto e non col nostro: su Windows si apre un menu grigio di
// sistema, con il carattere di sistema e i bordi di sistema. In un'app scura
// color rame quel grigio e' la cosa che grida «pagina web» piu' di ogni
// altra. Non e' un'opinione: e' l'unico elemento della schermata che non
// ubbidisce ai token.
//
// E' anche l'unico componente di questo strato che vale la pena di riscrivere
// da zero. Per input, textarea e data il nativo e' meglio di qualunque cosa
// potremmo fare (tastiere, riempimento automatico, calendario di sistema):
// quelli restano nativi dentro <cmd-campo>. La tendina no.
//
// IL PREZZO DA PAGARE, dichiarato: rifacendola ci si prende in carico tutto
// quello che il nativo faceva gratis. Qui dentro c'e' ed e' provato:
//   - tastiera:  frecce, Home/Fine, Invio, Spazio, Esc, Tab
//   - scrittura: si digitano le prime lettere e salta alla voce
//   - lettori di schermo: combobox + listbox, aria-activedescendant
//   - un tocco fuori chiude
//   - la tendina sta nel «top layer» (popover), quindi NON viene tagliata
//     quando il componente sta dentro un riquadro che scorre. E' l'errore
//     classico di questi controlli e non si vede finche' non capita.
// ============================================================================
import { html, css, nothing, type TemplateResult, type PropertyValues } from 'lit';
import { Elemento } from './base.ts';

export interface Opzione {
  valore: string;
  etichetta: string;
  disabilitata?: boolean;
}

let progressivo = 0;

export class Scelta extends Elemento {
  static override properties = {
    opzioni: { type: Array },
    valore: { type: String, reflect: true },
    segnaposto: { type: String },
    disabilitato: { type: Boolean, reflect: true },
    etichetta: { type: String },
    cercabile: { type: Boolean, reflect: true },
    aperto: { type: Boolean, state: true },
    filtro: { type: String, state: true },
    evidenziato: { type: Number, state: true },
  };

  declare opzioni: Opzione[];
  declare valore: string;
  /** Cosa mostrare quando non e' stato scelto niente. */
  declare segnaposto: string;
  declare disabilitato: boolean;
  /** Descrizione per i lettori di schermo, se non c'e' una <label> collegata. */
  declare etichetta: string;
  /** Aggiunge un campo di ricerca in cima all'elenco. Per liste lunghe. */
  declare cercabile: boolean;
  declare aperto: boolean;
  declare filtro: string;
  declare evidenziato: number;

  private readonly idBase = 'scelta-' + (++progressivo);
  private digitato = '';
  private orologio = 0;

  constructor() {
    super();
    this.opzioni = [];
    this.valore = '';
    this.segnaposto = '—';
    this.disabilitato = false;
    this.etichetta = '';
    this.cercabile = false;
    this.aperto = false;
    this.filtro = '';
    this.evidenziato = -1;
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;position:relative;}

    .comando{
      display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);
      width:100%;min-height:40px;padding:9px 10px;
      background:var(--bg-elev2);border:1px solid var(--line-strong);
      border-radius:var(--radius-sm);color:var(--paper);
      font-family:var(--font-body);font-size:var(--text-md);text-align:left;
      cursor:pointer;
      transition:border-color var(--tempo-istante) var(--curva);
    }
    @media (pointer:coarse){ .comando{min-height:var(--tocco-min);} }
    .comando:hover:not(:disabled){border-color:var(--brass);}
    .comando[aria-expanded="true"]{border-color:var(--copper);}
    .comando:disabled{opacity:0.45;cursor:default;}
    .scritta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .scritta.vuota{color:var(--brass);}
    .punta{
      flex:0 0 auto;color:var(--brass);font-size:11px;line-height:1;
      transition:transform var(--tempo-breve) var(--curva);
    }
    .comando[aria-expanded="true"] .punta{transform:rotate(180deg);}

    /* «popover» mette la tendina nel top layer del browser: sopra tutto, e
       soprattutto FUORI dai riquadri che tagliano il contenuto che scorre.
       La posizione la scrive JavaScript quando si apre, perche' li' dentro
       non esiste piu' un genitore a cui agganciarsi. */
    .tendina{
      position:fixed;margin:0;padding:var(--space-1);inset:auto;
      background:var(--bg-elev);border:1px solid var(--line-strong);
      border-radius:var(--radius-md);box-shadow:var(--shadow-float);
      max-height:min(320px,60vh);overflow-y:auto;overscroll-behavior:contain;
      z-index:400;
    }
    .tendina:not(:popover-open){display:none;}
    /* Entra scivolando di tre pixel: abbastanza per dire «sono comparsa
       adesso», troppo poco per far aspettare qualcuno. */
    @media (prefers-reduced-motion: no-preference){
      .tendina:popover-open{animation:entra var(--tempo-breve) var(--curva);}
      @keyframes entra{from{opacity:0;transform:translateY(-3px);}}
    }

    [role="option"]{
      display:flex;align-items:center;gap:var(--space-2);
      padding:8px 10px;border-radius:var(--radius-sm);
      font-size:var(--text-md);line-height:1.35;cursor:pointer;
      color:var(--paper);
    }
    @media (pointer:coarse){ [role="option"]{min-height:var(--tocco-min);} }
    [role="option"][aria-disabled="true"]{opacity:0.4;cursor:default;}
    /* Evidenziata = dove sta la tastiera. Scelta = quella che vale adesso.
       Sono due cose diverse e si vedono diverse: chi naviga con le frecce
       deve poter capire dove si trova senza perdere di vista cosa ha scelto. */
    [role="option"].evidenziata{background:var(--bg-elev2);}
    [role="option"][aria-selected="true"]{color:var(--copper-light);font-weight:600;}
    .segno{flex:0 0 auto;width:12px;font-size:var(--text-sm);color:var(--copper-light);}

    /* Il campo di ricerca resta fermo in cima mentre l'elenco scorre: con
       trecento ingredienti, scorrendo si perderebbe di vista cosa si e'
       scritto. */
    .ricerca{
      position:sticky;top:calc(var(--space-1) * -1);z-index:1;
      background:var(--bg-elev);padding:var(--space-1) var(--space-1) var(--space-2);
      margin:calc(var(--space-1) * -1) calc(var(--space-1) * -1) 0;
    }
    .ricerca input{
      width:100%;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:8px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    .ricerca input:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    .niente{
      padding:10px;font-family:var(--font-body);font-size:var(--text-xs);
      color:var(--brass);text-align:center;
    }
  `];

  /* Le voci da mostrare adesso. Con la ricerca accesa sono quelle che
     contengono quello che si sta scrivendo — CONTENGONO, non «cominciano per»:
     cercando «asparagi» si vuole trovare anche «Punte di asparagi». */
  private get scelte(): Opzione[] {
    const tutte = this.opzioni ?? [];
    if (!this.cercabile || !this.filtro.trim()) return tutte;
    const q = this.filtro.trim().toLowerCase();
    return tutte.filter(o => o.etichetta.toLowerCase().includes(q));
  }

  /* L'elenco completo. Serve a chi deve risalire alla voce scelta anche quando
     il filtro l'ha nascosta: altrimenti scrivendo nella ricerca il comando
     chiuso dimenticherebbe cosa c'era scritto dentro. */
  private get tutte(): Opzione[] { return this.opzioni ?? []; }

  private get scelta(): Opzione | undefined {
    return this.tutte.find(o => o.valore === this.valore);
  }

  private tendinaEl(): HTMLElement | null {
    return this.renderRoot.querySelector('.tendina');
  }

  private posiziona(): void {
    const t = this.tendinaEl();
    const c = this.renderRoot.querySelector('.comando');
    if (!t || !c) return;
    const r = c.getBoundingClientRect();
    t.style.minWidth = r.width + 'px';
    t.style.left = r.left + 'px';
    // Sotto se c'e' posto, sopra se non ce n'e': su un telefono con la
    // tastiera aperta lo spazio sotto e' quasi sempre finito.
    const sotto = window.innerHeight - r.bottom;
    if (sotto < 200 && r.top > sotto) {
      t.style.top = '';
      t.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    } else {
      t.style.bottom = '';
      t.style.top = (r.bottom + 4) + 'px';
    }
  }

  private apri(): void {
    if (this.disabilitato || this.aperto) return;
    this.aperto = true;
    this.evidenziato = Math.max(0, this.scelte.findIndex(o => o.valore === this.valore));
    void this.updateComplete.then(() => {
      this.tendinaEl()?.showPopover?.();
      this.posiziona();
      // Con la ricerca il fuoco entra nel campo: chi apre una lista lunga sta
      // gia' per scrivere, e un clic in piu' per arrivarci e' un clic sprecato.
      const ricerca = this.renderRoot.querySelector<HTMLInputElement>('.ricerca input');
      if (ricerca) ricerca.select();
      this.renderRoot.querySelector('.evidenziata')?.scrollIntoView({ block: 'nearest' });
    });
  }

  private chiudi(tornaAlComando = true): void {
    if (!this.aperto) return;
    this.aperto = false;
    this.filtro = '';
    this.tendinaEl()?.hidePopover?.();
    if (tornaAlComando) {
      (this.renderRoot.querySelector('.comando') as HTMLElement | null)?.focus();
    }
  }

  private conferma(i: number): void {
    const o = this.scelte[i];
    if (!o || o.disabilitata) return;
    const cambiato = o.valore !== this.valore;
    this.valore = o.valore;
    this.chiudi();
    // Si emette SOLO se e' cambiato davvero: riscegliere la stessa voce non e'
    // una modifica, e chi ascolta salverebbe per niente.
    if (cambiato) this.emetti('cmd-cambio', { valore: o.valore, opzione: o });
  }

  private muovi(passo: number): void {
    const n = this.scelte.length;
    if (!n) return;
    let i = this.evidenziato;
    for (let k = 0; k < n; k++) {
      i = (i + passo + n) % n;
      if (!this.scelte[i]?.disabilitata) { this.evidenziato = i; break; }
    }
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector('.evidenziata')?.scrollIntoView({ block: 'nearest' }));
  }

  /* Si digitano le prime lettere e salta alla voce, come nel nativo. In una
     brigata da quindici persone o in un elenco di cinquanta ingredienti e' la
     differenza fra scegliere e cercare. */
  private cerca(lettera: string): void {
    clearTimeout(this.orologio);
    this.digitato += lettera.toLowerCase();
    this.orologio = window.setTimeout(() => { this.digitato = ''; }, 600);
    const i = this.scelte.findIndex(o =>
      !o.disabilitata && o.etichetta.toLowerCase().startsWith(this.digitato));
    if (i < 0) return;
    if (this.aperto) this.evidenziato = i;
    else this.conferma(i);
  }

  private tasto(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (this.aperto) this.muovi(1); else this.apri();
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (this.aperto) this.muovi(-1); else this.apri();
        return;
      case 'Home':
        if (this.aperto) { e.preventDefault(); this.evidenziato = -1; this.muovi(1); }
        return;
      case 'End':
        if (this.aperto) { e.preventDefault(); this.evidenziato = 0; this.muovi(-1); }
        return;
      case ' ':
        // Nel campo di ricerca lo spazio e' una lettera, non una conferma.
        if (this.cercabile && this.aperto) return;
        e.preventDefault();
        if (this.aperto) this.conferma(this.evidenziato); else this.apri();
        return;
      case 'Enter':
        e.preventDefault();
        if (this.aperto) this.conferma(this.evidenziato); else this.apri();
        return;
      case 'Escape':
        if (this.aperto) { e.preventDefault(); this.chiudi(); }
        return;
      case 'Tab':
        this.chiudi(false);
        return;
      default:
        // La ricerca a salto («digiti le prime lettere») serve SOLO quando non
        // c'e' un campo di ricerca: con quello, le lettere devono finire li'.
        if (!this.cercabile && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          this.cerca(e.key);
        }
    }
  }

  private fuori = (e: MouseEvent): void => {
    if (!this.aperto) return;
    // composedPath e non e.target: dentro uno shadow DOM il bersaglio che
    // arriva da fuori e' il custom element, non il pezzo davvero cliccato.
    if (!e.composedPath().includes(this)) this.chiudi(false);
  };

  private riposiziona = (): void => { if (this.aperto) this.posiziona(); };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('pointerdown', this.fuori, true);
    window.addEventListener('resize', this.riposiziona);
    // `true`: si ascolta anche lo scorrimento dei riquadri interni, non solo
    // quello della pagina, altrimenti la tendina resta ferma mentre il
    // comando a cui appartiene se ne va.
    window.addEventListener('scroll', this.riposiziona, true);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.fuori, true);
    window.removeEventListener('resize', this.riposiziona);
    window.removeEventListener('scroll', this.riposiziona, true);
    clearTimeout(this.orologio);
  }

  override updated(cambi: PropertyValues): void {
    // Se le opzioni cambiano mentre e' aperta, la tendina puo' essere
    // diventata piu' alta o piu' bassa: va rimessa dov'e' giusto.
    if (cambi.has('opzioni') && this.aperto) this.posiziona();
  }

  override render(): TemplateResult {
    const s = this.scelta;
    return html`
      <button
        class="comando"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded=${this.aperto ? 'true' : 'false'}
        aria-controls="${this.idBase}-voci"
        aria-activedescendant=${this.aperto && this.evidenziato >= 0
          ? this.idBase + '-o' + this.evidenziato : nothing}
        aria-label=${this.etichetta || nothing}
        ?disabled=${this.disabilitato}
        @click=${() => { if (this.aperto) this.chiudi(); else this.apri(); }}
        @keydown=${this.tasto}
      >
        <span class="scritta ${s ? '' : 'vuota'}">${s ? s.etichetta : this.segnaposto}</span>
        <span class="punta" aria-hidden="true">▼</span>
      </button>

      <div class="tendina" popover="manual" id="${this.idBase}-elenco"
           aria-label=${this.etichetta || nothing}>
        ${this.cercabile ? html`
          <div class="ricerca">
            <input type="text" .value=${this.filtro} placeholder="cerca…"
                   role="combobox"
                   aria-expanded="true"
                   aria-label=${this.etichetta || nothing}
                   aria-controls="${this.idBase}-voci"
                   aria-activedescendant=${this.evidenziato >= 0
                     ? this.idBase + '-o' + this.evidenziato : nothing}
                   @input=${(e: Event) => {
                     this.filtro = (e.target as HTMLInputElement).value;
                     // Chi scrive si aspetta che Invio prenda la prima voce
                     // rimasta, non quella che era evidenziata prima del filtro.
                     this.evidenziato = 0;
                   }}
                   @keydown=${this.tasto}>
          </div>` : nothing}
        <div id="${this.idBase}-voci" role="listbox" aria-label=${this.etichetta || nothing}>
        ${this.scelte.length === 0 ? html`<div class="niente">nessuna voce</div>` : nothing}
        ${this.scelte.map((o, i) => html`
          <div
            id="${this.idBase}-o${i}"
            role="option"
            class=${i === this.evidenziato ? 'evidenziata' : ''}
            aria-selected=${o.valore === this.valore ? 'true' : 'false'}
            aria-disabled=${o.disabilitata ? 'true' : nothing}
            @click=${() => this.conferma(i)}
            @pointerenter=${() => { if (!o.disabilitata) this.evidenziato = i; }}
          >
            <span class="segno" aria-hidden="true">${o.valore === this.valore ? '✓' : ''}</span>
            <span>${o.etichetta}</span>
          </div>`)}
        </div>
      </div>`;
  }
}

customElements.define('cmd-scelta', Scelta);

declare global {
  interface HTMLElementTagNameMap { 'cmd-scelta': Scelta }
}
