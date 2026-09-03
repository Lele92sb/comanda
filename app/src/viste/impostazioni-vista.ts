// ============================================================================
// <cmd-impostazioni> — le impostazioni GENERALI della cucina.
//
// Oggi ce n'e' una sola, la valuta, e una schermata per una tendina sembra
// tanto. Ma la valuta non stava da nessuna parte: non e' un permesso (quelli
// stanno sulla riga della cucina, vedi CLAUDE.md), non e' del dispositivo come
// il tema e la lingua, non e' del ricettario ne' dei turni. E' della CUCINA, e
// le cose della cucina fin qui non avevano un posto.
//
// Quello che arrivera' qui si vede gia': il food cost obiettivo (oggi ripetuto
// su ogni piatto), l'IVA, il primo giorno della settimana, l'arrotondamento dei
// prezzi di vendita. Aprire il cassetto adesso, con dentro una cosa sola, costa
// meno che aprirlo alla terza.
//
// Non sa niente di `state`: riceve le valute e quella scelta, e manda un evento
// quando cambia. Il collante sta in `impostazioni.js`.
// ============================================================================
import { LitElement, html, css, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/campo.ts';
import '../ds/riquadro.ts';
import '../ds/scelta.ts';
import type { Opzione } from '../ds/scelta.ts';

export class Impostazioni extends LitElement {
  static override properties = {
    valute: { type: Array },
    valuta: { type: String },
    esempio: { type: String },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare valute: Opzione[];
  declare valuta: string;
  declare esempio: string;
  declare soloLettura: boolean;

  constructor() {
    super();
    this.valute = [];
    this.valuta = 'EUR';
    this.esempio = '';
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .spiega{
      font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin:0 0 var(--space-3);
    }
    /* L'esempio non e' decorazione: e' l'unico modo di vedere PRIMA di
       salvare che cosa cambia davvero — il segno, la virgola, dove va il
       segno. Nessuno sa a memoria come si scrive un prezzo in svedese. */
    .esempio{
      margin-top:var(--space-3);padding:var(--space-3);
      background:var(--bg-elev2);border-radius:var(--radius-md);
      display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap;
    }
    .esempio .quale{font-size:var(--text-xs);color:var(--brass);font-weight:600;}
    .esempio .quanto{font-family:var(--font-display);font-size:var(--text-xl);font-weight:600;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    return html`
      <p class="spiega">${t('Valgono per tutta la cucina: chiunque entri qui vede queste.')}</p>

      <cmd-campo etichetta=${t('Valuta')}
                 aiuto=${t('Cambia solo come sono SCRITTI i prezzi, non quanto valgono: nessun importo viene convertito.')}>
        <cmd-scelta .opzioni=${this.valute} valore=${this.valuta}
                    cercabile
                    ?disabilitato=${this.soloLettura}
                    etichetta=${t('Valuta della cucina')}
                    @cmd-cambio=${(e: CustomEvent<{ valore: string }>) =>
                      this.manda('impostazioni-valuta', { valore: e.detail.valore })}></cmd-scelta>
      </cmd-campo>

      <div class="esempio">
        <span class="quale">${t('Un prezzo si leggerà così')}</span>
        <span class="quanto">${this.esempio}</span>
      </div>`;
  }
}

customElements.define('cmd-impostazioni', Impostazioni);

declare global {
  interface HTMLElementTagNameMap { 'cmd-impostazioni': Impostazioni }
}
