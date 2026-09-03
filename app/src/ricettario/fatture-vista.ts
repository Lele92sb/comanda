// ============================================================================
// <cmd-esito-importazione> e <cmd-storico-fatture> — cosa e' successo quando
// hai dato in pasto all'app un mucchio di fatture elettroniche.
//
// SONO DUE COSE DIVERSE E VANNO TENUTE SEPARATE:
//   l'ESITO e' quello che e' appena successo, e sparisce alla prossima
//     importazione. Va letto adesso.
//   lo STORICO e' la memoria delle ultime venti, e serve a UNA cosa sola:
//     rimediare a un errore recente. Non e' un archivio contabile — quello e'
//     il cassetto fiscale, e non e' il mestiere di questa app.
//
// IL RESOCONTO SI PUO' CHIUDERE. Importando quaranta fatture escono quaranta
// righe di dettaglio, e sotto ci sono gli ingredienti nuovi da controllare:
// lasciarle aperte vuol dire far scorrere due schermate a chi voleva solo
// vedere se e' andata bene. Il riassunto in una riga resta sempre visibile.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/riquadro.ts';
import '../ds/scheda.ts';
import '../ds/vuoto.ts';

export interface ImportazioneVista {
  id: string;
  fornitore: string;
  /** Il numero e la data del documento. */
  etichetta: string;
  /** Quando è stata importata, già scritta: «3 set, 14:20». */
  quando: string;
  /** «2 nuovi, 5 aggiornati», oppure «nessuna modifica». */
  cosa: string;
}

/* ------------------------------------------------------------------- ESITO */

export class EsitoImportazione extends LitElement {
  static override properties = {
    riassunto: { type: String },
    dettagli: { type: Array },
    tono: { type: String },
    /** Un lavoro ancora in corso, es. la stima delle rese. */
    inCorso: { type: String },
    dettagliAperti: { type: Boolean, state: true },
  };

  declare riassunto: string;
  declare dettagli: string[];
  declare tono: 'ok' | 'allarme' | 'nota';
  declare inCorso: string;
  declare dettagliAperti: boolean;

  constructor() {
    super();
    this.riassunto = '';
    this.dettagli = [];
    this.tono = 'ok';
    this.inCorso = '';
    this.dettagliAperti = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    :host(:not([mostra])){display:none;}
    .dettagli{
      font-family:var(--font-mono);font-size:var(--text-xs);color:var(--brass);
      line-height:1.7;white-space:pre-line;margin:var(--space-2) 0 0;
      max-height:40vh;overflow:auto;
    }
    .aspetta{display:flex;align-items:center;gap:var(--space-2);
      font-family:var(--font-mono);font-size:var(--text-xs);color:var(--brass);
      margin-top:var(--space-2);}
    .giro{width:12px;height:12px;border-radius:50%;flex:0 0 auto;
      border:2px solid currentColor;border-top-color:transparent;
      animation:gira 620ms linear infinite;}
    @keyframes gira{to{transform:rotate(360deg);}}
    @media (prefers-reduced-motion: reduce){ .giro{animation:none;opacity:.55;} }
  `;

  override render(): TemplateResult {
    this.toggleAttribute('mostra', Boolean(this.riassunto || this.inCorso));
    if (!this.riassunto && !this.inCorso) return html``;
    return html`
      ${this.riassunto ? html`<cmd-avviso tono=${this.tono}>${this.riassunto}</cmd-avviso>` : nothing}
      ${this.inCorso ? html`
        <div class="aspetta"><span class="giro" aria-hidden="true"></span>${this.inCorso}</div>` : nothing}
      ${this.dettagli.length ? html`
        <cmd-riquadro comprimibile piatto ?aperto=${this.dettagliAperti}
                      @cmd-apertura=${(e: CustomEvent<{ aperto: boolean }>) => { this.dettagliAperti = e.detail.aperto; }}
                      titolo=${t('Il dettaglio, riga per riga')}
                      sottotitolo=${t('{n} righe', { n: this.dettagli.length })}>
          <p class="dettagli">${this.dettagli.join('\n')}</p>
        </cmd-riquadro>` : nothing}`;
  }
}

customElements.define('cmd-esito-importazione', EsitoImportazione);

/* ------------------------------------------------------------------ STORICO */

export class StoricoFatture extends LitElement {
  static override properties = {
    importazioni: { type: Array },
  };

  declare importazioni: ImportazioneVista[];

  constructor() {
    super();
    this.importazioni = [];
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .riga{font-family:var(--font-mono);font-size:11px;color:var(--brass);
      line-height:1.6;margin-top:3px;overflow-wrap:anywhere;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    if (!this.importazioni.length) {
      return html`
        <cmd-vuoto simbolo="🧾" titolo=${t('Nessuna importazione')}
                   spiega=${t('Caricando le fatture elettroniche XML, l\'app crea i fornitori e aggiorna i prezzi d\'acquisto da sola. Le ultime venti restano qui, per poter tornare indietro.')}></cmd-vuoto>`;
    }
    return html`${repeat(this.importazioni, i => i.id, i => html`
      <cmd-scheda titolo=${i.fornitore}>
        <div class="riga">${i.etichetta} · ${i.quando} · ${i.cosa}</div>
        <cmd-bottone slot="azioni" misura="piccolo" variante="pericolo"
                     @click=${() => this.manda('importazione-annulla', { id: i.id })}
        >${t('Annulla')}</cmd-bottone>
      </cmd-scheda>`)}`;
  }
}

customElements.define('cmd-storico-fatture', StoricoFatture);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-esito-importazione': EsitoImportazione;
    'cmd-storico-fatture': StoricoFatture;
  }
}
