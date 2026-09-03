// ============================================================================
// <cmd-fabbisogno> — quante persone servono, per servizio e per partita.
//
// DUE EVENTI PER LO STESSO CAMPO, ed e' la parte che conta.
// Il numero deve aggiornare SUBITO il conto di capienza qui accanto: e' li'
// che si vede se alzare il lavaggio di uno sfonda la brigata, e vederlo dopo
// non serve a niente. Ma non deve salvare subito: sul cloud, scrivere «12»
// sarebbero due scritture di rete, e ripensarci quattro.
//
// Quindi:
//   fabbisogno-conteggio-provvisorio   a ogni tasto — aggiorna il conto
//   fabbisogno-conteggio               all'uscita dal campo — salva
//
// E' la stessa distinzione che fa una cucina fra assaggiare e mandare.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/riquadro.ts';
import '../ds/scelta.ts';
import '../ds/vuoto.ts';
import type { Opzione } from '../ds/scelta.ts';

export interface RigaFabbisogno {
  stazioneId: string;
  conteggio: number;
}

export interface ServizioFabbisogno {
  id: string;
  nome: string;
  righe: RigaFabbisogno[];
}

export interface StazioneScelta { id: string; nome: string }

export class Fabbisogno extends LitElement {
  static override properties = {
    servizi: { type: Array },
    stazioni: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare servizi: ServizioFabbisogno[];
  declare stazioni: StazioneScelta[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.servizi = [];
    this.stazioni = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .riga{
      display:grid;grid-template-columns:2fr 96px auto;gap:var(--space-2);
      align-items:center;margin-bottom:var(--space-2);
    }
    @media(max-width:560px){ .riga{grid-template-columns:1fr 76px auto;} }

    input[type=number]{
      width:100%;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-mono);font-size:var(--text-md);text-align:right;
    }
    input[type=number]:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input[type=number]{min-height:var(--tocco-min);} }

    .nota{font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin:0 0 var(--space-2);}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private get opzioni(): Opzione[] {
    return this.stazioni.map(s => ({ valore: s.id, etichetta: s.nome }));
  }

  private riga(sv: ServizioFabbisogno, r: RigaFabbisogno, i: number): TemplateResult {
    return html`
      <div class="riga">
        <cmd-scelta .opzioni=${this.opzioni} valore=${r.stazioneId}
                    etichetta=${t('Partita')}
                    ?disabilitato=${this.soloLettura}
                    @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.manda('fabbisogno-stazione', {
                      servizioId: sv.id, indice: i, stazioneId: e.detail.valore,
                    })}></cmd-scelta>
        <input type="number" min="0" value=${String(r.conteggio)}
               aria-label=${t('Quante persone')}
               ?disabled=${this.soloLettura}
               @input=${(e: Event) => this.manda('fabbisogno-conteggio-provvisorio', {
                 servizioId: sv.id, indice: i,
                 valore: parseInt((e.target as HTMLInputElement).value, 10) || 0,
               })}
               @change=${(e: Event) => this.manda('fabbisogno-conteggio', {
                 servizioId: sv.id, indice: i,
                 valore: parseInt((e.target as HTMLInputElement).value, 10) || 0,
               })}>
        ${this.soloLettura ? nothing : html`
          <cmd-bottone misura="piccolo" variante="pericolo"
                       etichetta=${t('Togli questa riga')}
                       @click=${() => this.manda('fabbisogno-riga-rimuovi', { servizioId: sv.id, indice: i })}
          >✕</cmd-bottone>`}
      </div>`;
  }

  override render(): TemplateResult {
    if (!this.stazioni.length) {
      return html`
        <cmd-vuoto simbolo="🍳" titolo=${t('Nessuna partita')}
                   spiega=${t('Il fabbisogno dice quante persone servono in ogni partita. Prima vanno create le partite, in Impostazioni cucina → Stazioni.')}>
        </cmd-vuoto>`;
    }
    return html`
      ${this.servizi.map(sv => html`
        <cmd-riquadro titolo=${sv.nome}>
          ${sv.righe.length
            ? repeat(sv.righe, (_r, i) => sv.id + ':' + i, (r, i) => this.riga(sv, r, i))
            : html`<p class="nota">${t('Nessuna riga: in questo servizio non serve nessuno.')}</p>`}
          ${this.soloLettura ? nothing : html`
            <cmd-bottone misura="piccolo" variante="fantasma"
                         @click=${() => this.manda('fabbisogno-riga-aggiungi', { servizioId: sv.id })}
            >+ ${t('Riga')}</cmd-bottone>`}
        </cmd-riquadro>`)}`;
  }
}

customElements.define('cmd-fabbisogno', Fabbisogno);

declare global {
  interface HTMLElementTagNameMap { 'cmd-fabbisogno': Fabbisogno }
}
