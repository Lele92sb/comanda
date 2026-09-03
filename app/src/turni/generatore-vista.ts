// ============================================================================
// I comandi intorno al generatore di turni.
//
// <cmd-eccedenza>      dove finiscono le ore di contratto che il fabbisogno
//                      non chiede
// <cmd-pubblicazione>  chi vede questi turni, e da quando
// <cmd-riepilogo>      com'e' andata, in una riga
//
// LA RIGA DI RIEPILOGO E' UNA RIGA, e il resto sta dietro un clic. Parole del
// proprietario: «sono molto invadenti e per vedere i turni bisogna scorrere
// troppo». Prima erano cinque riquadri uno sotto l'altro. Quello che NON puo'
// aspettare — un posto scoperto — resta scritto anche a riepilogo chiuso, ed
// e' l'unica cosa che chiede una decisione oggi.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/chip.ts';
import '../ds/riquadro.ts';

/* ------------------------------------------------------- ORE IN ECCEDENZA */

export type ModoEccedenza = 'auto' | 'giorni' | 'lascia';

export class Eccedenza extends LitElement {
  static override properties = {
    modo: { type: String },
    giorni: { type: Array },
    giorniPossibili: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare modo: ModoEccedenza;
  /** I giorni scelti, IN ORDINE di preferenza. L'ordine è il dato. */
  declare giorni: string[];
  declare giorniPossibili: string[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.modo = 'auto';
    this.giorni = [];
    this.giorniPossibili = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:var(--space-2);}
    .nota{font-family:var(--font-mono);font-size:var(--text-xs);color:var(--brass);
      line-height:1.6;margin:var(--space-2) 0 0;}
    .rango{font-weight:700;color:inherit;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  /* Lo stato in chiaro anche a riquadro chiuso: senza, chiuderlo diventa
     nascondere invece che riassumere. */
  private get sommario(): string {
    if (this.modo === 'lascia') return t('restano in tasca');
    if (this.modo === 'giorni') {
      return this.giorni.length
        ? t('sui giorni che hai scelto') + ' (' + this.giorni.join(', ') + ')'
        : t('le scegli tu, ma non hai ancora scelto i giorni');
    }
    return t('le colloca l\'app');
  }

  override render(): TemplateResult {
    const modi: { id: ModoEccedenza; etichetta: string }[] = [
      { id: 'auto', etichetta: t('le colloca l\'app') },
      { id: 'giorni', etichetta: t('scelgo io i giorni') },
      { id: 'lascia', etichetta: t('restano in tasca') },
    ];
    return html`
      <cmd-riquadro comprimibile
                    titolo=${t('Le ore che avanzano')}
                    sottotitolo=${this.sommario}>
        <p class="nota">${t('Quando il fabbisogno non chiede tutti i turni di una persona, quelle ore le paghi lo stesso. Qui decidi se collocarle, dove, o lasciarle stare.')}</p>
        <div class="chips">
          ${modi.map(m => html`
            <cmd-chip ?acceso=${this.modo === m.id} ?disabilitato=${this.soloLettura}
                      @cmd-chip=${() => this.manda('eccedenza-modo', { modo: m.id })}
            >${m.etichetta}</cmd-chip>`)}
        </div>

        ${this.modo === 'giorni' ? html`
          <p class="nota">${t('I giorni non sono interruttori: si accodano. L\'app scorre la fila dall\'alto finché le ore ci stanno, e il numero dice a che punto sta ciascuno.')}</p>
          <div class="chips">
            ${this.giorniPossibili.map(g => {
              const i = this.giorni.indexOf(g);
              return html`
                <cmd-chip ?acceso=${i >= 0} ?disabilitato=${this.soloLettura}
                          @cmd-chip=${() => this.manda('eccedenza-giorno', { giorno: g })}>
                  ${g}${i >= 0 ? html` <span class="rango">${i + 1}</span>` : nothing}
                </cmd-chip>`;
            })}
          </div>` : nothing}
      </cmd-riquadro>`;
  }
}

customElements.define('cmd-eccedenza', Eccedenza);

/* --------------------------------------------------------- PUBBLICAZIONE */

export class Pubblicazione extends LitElement {
  static override properties = {
    giorniTotali: { type: Number },
    giorniPubblicati: { type: Number },
    nascosta: { type: Boolean, reflect: true },
  };

  declare giorniTotali: number;
  declare giorniPubblicati: number;
  /** Chi non può modificare non pubblica niente: per lui il riquadro non esiste. */
  declare nascosta: boolean;

  constructor() {
    super();
    this.giorniTotali = 0;
    this.giorniPubblicati = 0;
    this.nascosta = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    :host([nascosta]){display:none;}
    *,*::before,*::after{box-sizing:border-box;}
    .comandi{display:flex;gap:var(--space-2);flex-wrap:wrap;}
  `;

  private manda(nome: string): void {
    this.dispatchEvent(new CustomEvent(nome, { bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    const tutte = this.giorniTotali > 0 && this.giorniPubblicati === this.giorniTotali;
    const stato = tutte
      ? t('Periodo pubblicato')
      : this.giorniPubblicati
        ? t('Pubblicato in parte: {n} giorni su {tot}', { n: this.giorniPubblicati, tot: this.giorniTotali })
        : t('Non ancora pubblicato');
    const nota = tutte
      ? t('La brigata vede questi turni.')
      : t('La brigata non vede questi turni finché non li pubblichi.');

    return html`
      <cmd-riquadro titolo=${stato} sottotitolo=${nota}>
        <div class="comandi" slot="azioni">
          <cmd-bottone variante=${tutte ? 'fantasma' : 'principale'}
                       @click=${() => this.manda('pubblicazione-inverti')}
          >${tutte ? t('Nascondi') : t('Pubblica')}</cmd-bottone>
          ${/* Revoca compare appena c'e' anche un solo giorno pubblicato, e
                sparisce quando lo fa gia' il pulsante principale: a periodo
                intero «Nascondi» e «Revoca» sarebbero due bottoni per la
                stessa cosa. */ nothing}
          ${!tutte && this.giorniPubblicati ? html`
            <cmd-bottone variante="pericolo"
                         @click=${() => this.manda('pubblicazione-revoca')}
            >${t('Revoca')}</cmd-bottone>` : nothing}
        </div>
      </cmd-riquadro>`;
  }
}

customElements.define('cmd-pubblicazione', Pubblicazione);

/* ------------------------------------------------------------- RIEPILOGO */

export class Riepilogo extends LitElement {
  static override properties = {
    voci: { type: Array },
    /** C'è del dettaglio da mostrare dietro il pulsante. */
    conDettagli: { type: Boolean },
    aperto: { type: Boolean, reflect: true },
  };

  declare voci: string[];
  declare conDettagli: boolean;
  declare aperto: boolean;

  constructor() {
    super();
    this.voci = [];
    this.conDettagli = false;
    this.aperto = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);
      margin-bottom:var(--space-3);}
    :host(:not([mostra])){display:none;}
    *,*::before,*::after{box-sizing:border-box;}
    .riga{
      display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);
      flex-wrap:wrap;
      padding:10px 14px;border:1px solid var(--line);border-radius:var(--radius-md);
      background:var(--bg-elev);font-size:var(--text-md);
    }
    .esito{overflow-wrap:anywhere;min-width:0;}
    .allarme{color:var(--alert);font-weight:700;}
  `;

  private manda(nome: string): void {
    this.dispatchEvent(new CustomEvent(nome, { bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    this.toggleAttribute('mostra', this.voci.length > 0 || this.conDettagli);
    if (!this.voci.length && !this.conDettagli) return html``;
    return html`
      <div class="riga">
        <span class="esito">${this.voci.length
          ? this.voci.map((v, i) => html`${i ? ' · ' : ''}<span class=${v.startsWith('!') ? 'allarme' : ''}>${v.replace(/^!/, '')}</span>`)
          : html`<b>✓ ${t('Fabbisogno coperto, senza turni extra')}</b>`}</span>
        ${this.conDettagli ? html`
          <cmd-bottone misura="piccolo" variante="fantasma"
                       @click=${() => { this.aperto = !this.aperto; this.manda('riepilogo-inverti'); }}
          >${this.aperto ? t('Nascondi') : t('Dettagli')}</cmd-bottone>` : nothing}
      </div>`;
  }
}

customElements.define('cmd-riepilogo', Riepilogo);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-eccedenza': Eccedenza;
    'cmd-pubblicazione': Pubblicazione;
    'cmd-riepilogo': Riepilogo;
  }
}
