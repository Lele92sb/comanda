// ============================================================================
// <cmd-benessere> — le ore vere, quelle fatte, non quelle previste.
//
// La differenza con i turni e' tutta qui: il prospetto dice quanto DOVREBBE
// lavorare una persona, questa scheda dice quanto ha lavorato davvero. In
// cucina le due cose non coincidono quasi mai, e la seconda e' quella che
// stanca le persone.
//
// LA SOGLIA E' 48 ORE, e la riga si accende. Non e' un numero nostro: e' la
// media massima settimanale della direttiva europea sull'orario di lavoro.
// Serve come riferimento, non come obiettivo — ed e' scritto, perche' un
// numero rosso senza una ragione si impara a ignorare in una settimana.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/riquadro.ts';
import '../ds/scelta.ts';
import '../ds/vuoto.ts';
import type { Opzione } from '../ds/scelta.ts';

export interface OreSettimana {
  nome: string;
  ore: number;
  oltreSoglia: boolean;
}

export class Benessere extends LitElement {
  static override properties = {
    persone: { type: Array },
    settimana: { type: Array },
    promemoria: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
    personaScelta: { type: String, state: true },
    errore: { type: String, state: true },
  };

  declare persone: Opzione[];
  declare settimana: OreSettimana[];
  declare promemoria: string[];
  declare soloLettura: boolean;
  declare personaScelta: string;
  declare errore: string;

  constructor() {
    super();
    this.persone = [];
    this.settimana = [];
    this.promemoria = [];
    this.soloLettura = false;
    this.personaScelta = '';
    this.errore = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .due{grid-template-columns:1fr;} }
    .riga{
      display:flex;justify-content:space-between;gap:var(--space-3);
      padding:var(--space-1) 0;border-bottom:1px solid var(--line);
      font-size:var(--text-md);
    }
    .riga:last-child{border-bottom:none;}
    .ore{font-family:var(--font-mono);color:var(--sage);}
    .ore.oltre{color:var(--alert);font-weight:700;}
    .promemoria{font-size:var(--text-md);line-height:1.7;color:var(--paper-dim);}
    .promemoria li{margin-bottom:var(--space-3);}
    .promemoria li:last-child{margin-bottom:0;}
    ul{margin:0;padding-left:1.1em;}
    .nota{font-family:var(--font-mono);font-size:var(--text-xs);
      color:var(--brass);line-height:1.6;margin:var(--space-2) 0 0;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private registra(): void {
    const data = this.renderRoot.querySelector<HTMLInputElement>('#b-data')?.value ?? '';
    const ore = parseFloat(this.renderRoot.querySelector<HTMLInputElement>('#b-ore')?.value ?? '');
    if (!this.personaScelta || !data || !ore) {
      this.errore = t('Scegli la persona, il giorno e quante ore ha fatto.');
      return;
    }
    this.errore = '';
    this.manda('benessere-registra', { personaId: this.personaScelta, data, ore });
    const campoOre = this.renderRoot.querySelector<HTMLInputElement>('#b-ore');
    if (campoOre) { campoOre.value = ''; campoOre.focus(); }
  }

  override render(): TemplateResult {
    return html`
      ${this.soloLettura ? nothing : html`
        <cmd-riquadro titolo=${t('Registra una giornata')}
                      sottotitolo=${t('Le ore effettive, non quelle del prospetto')}>
          ${this.persone.length ? html`
            <div class="due">
              <cmd-campo etichetta=${t('Chi')} style="margin:0">
                <cmd-scelta .opzioni=${this.persone} valore=${this.personaScelta}
                            segnaposto=${t('scegli')}
                            @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => { this.personaScelta = e.detail.valore; }}></cmd-scelta>
              </cmd-campo>
              <cmd-campo etichetta=${t('Giorno')} style="margin:0">
                <input type="date" id="b-data">
              </cmd-campo>
            </div>
            <cmd-campo etichetta=${t('Ore lavorate')} errore=${this.errore}>
              <input type="number" id="b-ore" min="0" max="20" step="0.5" placeholder="es. 10.5"
                     @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.registra(); }}>
            </cmd-campo>
            <cmd-bottone variante="principale" @click=${this.registra}>${t('Registra')}</cmd-bottone>`
          : html`<p class="nota">${t('Aggiungi prima qualcuno alla brigata.')}</p>`}
        </cmd-riquadro>`}

      <cmd-riquadro titolo=${t('Questa settimana')}
                    sottotitolo=${t('Ore effettive registrate, da lunedì a domenica')}>
        ${this.settimana.length
          ? this.settimana.map(r => html`
              <div class="riga">
                <span>${r.nome}</span>
                <span class="ore ${r.oltreSoglia ? 'oltre' : ''}">${r.ore.toFixed(1)}h ${r.oltreSoglia ? '⚠' : '✓'}</span>
              </div>`)
          : html`<cmd-vuoto simbolo="🗒" titolo=${t('Nessuna ora registrata')}
                            spiega=${t('Registra le giornate qui sopra: servono a vedere chi sta lavorando più di quanto il prospetto dica.')}></cmd-vuoto>`}
        ${this.settimana.some(r => r.oltreSoglia) ? html`
          <p class="nota">${t('La soglia è 48 ore: è la media massima settimanale indicata dalla direttiva europea sull\'orario di lavoro. È un riferimento, non un obiettivo.')}</p>` : nothing}
      </cmd-riquadro>

      <cmd-riquadro comprimibile titolo=${t('Promemoria')}
                    sottotitolo=${t('Quattro cose che in cucina fanno differenza')}>
        <ul class="promemoria">
          ${this.promemoria.map(x => html`<li>${x}</li>`)}
        </ul>
      </cmd-riquadro>`;
  }
}

customElements.define('cmd-benessere', Benessere);

declare global {
  interface HTMLElementTagNameMap { 'cmd-benessere': Benessere }
}
