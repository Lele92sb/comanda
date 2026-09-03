// ============================================================================
// <cmd-scheda-sub> e <cmd-scheda-piatto> — i due moduli del ricettario.
//
// Sono l'ultimo pezzo dell'app che era fatto di stringhe, e sono anche i due
// posti dove si decide se un piatto paga la cucina che lo fa.
//
// IL CONTO SI VEDE MENTRE SCRIVI, in tutti e due. Non e' una nota a margine:
// e' il numero per cui questi moduli esistono.
//   sub-ricetta   costo totale dei componenti, e costo per unita' di resa —
//                 che e' quello che poi finisce dentro i piatti. Se la resa e'
//                 2 kg su 3 kg di crudo, il chilo di fondo costa la meta' in
//                 piu' del chilo di ossa, e nessuno lo tiene a mente.
//   piatto        food cost reale e margine, subito sotto il prezzo. Il prezzo
//                 SUGGERITO viene dal target; quello EFFETTIVO lo scrivi tu, e
//                 la differenza fra i due e' esattamente la domanda.
//
// LE RIGHE DEI COMPONENTI SONO UN COMPONENTE A PARTE (<cmd-righe-ricetta>) e
// stanno dentro tutti e due: e' la stessa cosa, ed era gia' la stessa funzione.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import { simbolo, soldi } from '../core/valuta.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/scelta.ts';
import type { Opzione } from '../ds/scelta.ts';

export interface ContoRicetta {
  /** «8,70 €», già scritto da chi passa i dati. */
  totale: string;
  /** «4,35 € per kg», o '' se la resa non è ancora indicata. */
  perUnita: string;
  /** Una frase che spiega, o ''. */
  spiega: string;
}

export interface ContoPiatto {
  costo: string;
  suggerito: string;
  foodCost: string;
  margine: string;
  fuoriLinea: boolean;
  margineNegativo: boolean;
}

const stile = css`
  :host{display:block;font-family:var(--font-body);color:var(--paper);}
  *,*::before,*::after{box-sizing:border-box;}
  .scatola{background:var(--bg-elev);border:1px solid var(--line);
    border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);}
  h3{margin:0 0 var(--space-3);font-family:var(--font-display);
    font-size:var(--text-lg);font-weight:600;}
  .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
  .tre{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3);}
  @media(max-width:560px){ .due,.tre{grid-template-columns:1fr;} }
  .etichetta{display:block;font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
    color:var(--brass);
    margin:var(--space-4) 0 var(--space-1);}
  .azioni{display:flex;gap:var(--space-3);margin-top:var(--space-4);}
  .chips{display:flex;flex-wrap:wrap;gap:6px;}

  input,textarea{
    width:100%;
    background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
    padding:9px 10px;border-radius:var(--radius-sm);
    font-family:var(--font-body);font-size:var(--text-md);
  }
  textarea{min-height:90px;resize:vertical;}
  input:focus,textarea:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
  @media (pointer:coarse){ input{min-height:var(--tocco-min);} }

  /* Il conto mentre scrivi. Non e' una nota a margine: e' il numero per cui
     questo modulo esiste, quindi si vede come un numero. */
  .conto{
    display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4);align-items:baseline;
    background:var(--bg-elev2);border-radius:var(--radius-md);
    padding:var(--space-3);margin-top:var(--space-3);
  }
  .voce{font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
    color:var(--brass);}
  .voce b{display:block;font-family:var(--font-display);font-size:22px;
    font-weight:700;color:var(--copper-light);letter-spacing:0;}
  .voce.buono b{color:var(--sage);}
  .voce.storto b{color:var(--alert);}
  .spiega{font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);
    line-height:1.6;flex-basis:100%;margin:0;}
  .miniatura{max-width:140px;border-radius:var(--radius-md);margin-top:var(--space-2);display:block;}
`;

/* ------------------------------------------------------------ SUB-RICETTA */

export class SchedaSub extends LitElement {
  static override properties = {
    nome: { type: String },
    resa: { type: String },
    unita: { type: String },
    note: { type: String },
    unitaPossibili: { type: Array },
    conto: { type: Object },
    daFoto: { type: Boolean },
    nuova: { type: Boolean },
    errore: { type: String },
  };

  declare nome: string;
  declare resa: string;
  declare unita: string;
  declare note: string;
  declare unitaPossibili: string[];
  declare conto: ContoRicetta;
  /** I campi arrivano da una foto: vanno controllati, e la resa va messa a mano. */
  declare daFoto: boolean;
  declare nuova: boolean;
  declare errore: string;

  constructor() {
    super();
    this.nome = '';
    this.resa = '';
    this.unita = 'kg';
    this.note = '';
    this.unitaPossibili = ['kg', 'l', 'pz'];
    this.conto = { totale: soldi(0), perUnita: '', spiega: '' };
    this.daFoto = false;
    this.nuova = true;
    this.errore = '';
  }

  static override styles = stile;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private salva(): void {
    const nome = this.nome.trim();
    if (!nome) { this.errore = t('Serve il nome della sub-ricetta'); return; }
    this.errore = '';
    this.manda('sub-salva', {
      nome, resa: this.resa, unita: this.unita,
      note: (this.renderRoot.querySelector<HTMLTextAreaElement>('#s-note')?.value ?? '').trim(),
    });
  }

  override render(): TemplateResult {
    const opzioni: Opzione[] = this.unitaPossibili.map(u => ({ valore: u, etichetta: u }));
    return html`
      <div class="scatola">
        <h3>${this.nuova ? t('Nuova sub-ricetta') : t('Modifica sub-ricetta')}</h3>

        ${this.daFoto ? html`
          <cmd-avviso tono="ok">${t('Campi precompilati dalla foto — controlla componenti e quantità, e imposta tu la resa finale: dalla foto non si deduce.')}</cmd-avviso>` : nothing}

        <cmd-campo etichetta=${t('Nome')} obbligatorio errore=${this.errore}
                   aiuto=${t('es. Ragù di carne, Fondo di vitello')}>
          <input type="text" id="s-nome" .value=${this.nome}
                 @input=${(e: Event) => { this.nome = (e.target as HTMLInputElement).value; }}>
        </cmd-campo>

        <span class="etichetta">${t('Componenti')}</span>
        <slot name="righe"></slot>

        <div class="due">
          <cmd-campo etichetta=${t('Resa finale')}
                     aiuto=${t('Quanto ne viene fuori dopo cottura e lavorazione.')} style="margin:0">
            <input type="number" step="0.001" .value=${this.resa}
                   @input=${(e: Event) => { this.resa = (e.target as HTMLInputElement).value;
                                            this.manda('sub-conto', { resa: this.resa, unita: this.unita }); }}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Unità della resa')} style="margin:0">
            <cmd-scelta .opzioni=${opzioni} valore=${this.unita}
                        @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => {
                          this.unita = e.detail.valore;
                          this.manda('sub-conto', { resa: this.resa, unita: this.unita }); }}></cmd-scelta>
          </cmd-campo>
        </div>

        <div class="conto">
          <span class="voce">${t('componenti')}<b>${this.conto.totale}</b></span>
          ${this.conto.perUnita
            ? html`<span class="voce">${t('per')} ${this.unita}<b>${this.conto.perUnita}</b></span>`
            : nothing}
          ${this.conto.spiega ? html`<p class="spiega">${this.conto.spiega}</p>` : nothing}
        </div>

        <cmd-campo etichetta=${t('Note')}
                   aiuto=${t('Procedimento, calo peso previsto, quello che serve ricordare.')}>
          <textarea id="s-note" .value=${this.note}></textarea>
        </cmd-campo>

        <div class="azioni">
          <cmd-bottone variante="principale" @click=${this.salva}>${t('Salva')}</cmd-bottone>
          <cmd-bottone variante="fantasma"
                       @click=${() => this.manda('sub-annulla', {})}>${t('Annulla')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-scheda-sub', SchedaSub);

/* ----------------------------------------------------------------- PIATTO */

export class SchedaPiatto extends LitElement {
  static override properties = {
    campi: { type: Object },
    allergeniPossibili: { type: Array },
    allergeni: { type: Array },
    conto: { type: Object },
    foto: { type: String },
    daFoto: { type: Boolean },
    nuovo: { type: Boolean },
    errore: { type: String },
  };

  declare campi: Record<string, string>;
  declare allergeniPossibili: string[];
  declare allergeni: string[];
  declare conto: ContoPiatto;
  /** Data URL della foto, '' se non c'e'. */
  declare foto: string;
  declare daFoto: boolean;
  declare nuovo: boolean;
  declare errore: string;

  constructor() {
    super();
    this.campi = { nome: '', categoria: '', porzione: '', minuti: '', target: '30', prezzo: '', procedimento: '', note: '' };
    this.allergeniPossibili = [];
    this.allergeni = [];
    this.conto = { costo: soldi(0), suggerito: soldi(0), foodCost: '—', margine: soldi(0),
                   fuoriLinea: false, margineNegativo: false };
    this.foto = '';
    this.daFoto = false;
    this.nuovo = true;
    this.errore = '';
  }

  static override styles = stile;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scrivi(campo: string, valore: string): void {
    this.campi = { ...this.campi, [campo]: valore };
    this.manda('piatto-conto', { campi: this.campi });
  }

  private salva(): void {
    const nome = (this.campi['nome'] ?? '').trim();
    if (!nome) { this.errore = t('Serve il nome del piatto'); return; }
    this.errore = '';
    this.manda('piatto-salva', {
      campi: { ...this.campi, nome },
      allergeni: this.allergeni.slice(),
    });
  }

  private campo(id: string, etichetta: string, tipo = 'text', aiuto = ''): TemplateResult {
    return html`
      <cmd-campo etichetta=${etichetta} aiuto=${aiuto} style="margin:0">
        <input type=${tipo} .value=${this.campi[id] ?? ''}
               @input=${(e: Event) => this.scrivi(id, (e.target as HTMLInputElement).value)}>
      </cmd-campo>`;
  }

  override render(): TemplateResult {
    return html`
      <div class="scatola">
        <h3>${this.nuovo ? t('Nuova scheda piatto') : t('Modifica piatto')}</h3>

        ${this.daFoto ? html`
          <cmd-avviso tono="ok">${t('Campi precompilati dalla foto — controlla i componenti e le quantità prima di salvare.')}</cmd-avviso>` : nothing}

        <cmd-campo etichetta=${t('Nome del piatto')} obbligatorio errore=${this.errore}>
          <input type="text" id="p-nome" .value=${this.campi['nome'] ?? ''}
                 @input=${(e: Event) => this.scrivi('nome', (e.target as HTMLInputElement).value)}>
        </cmd-campo>

        <div class="tre">
          ${this.campo('categoria', t('Categoria'), 'text', t('es. Antipasti'))}
          ${this.campo('porzione', t('Porzione (g/ml)'), 'number')}
          ${this.campo('minuti', t('Minuti di preparazione'), 'number')}
        </div>

        <span class="etichetta">${t('Componenti')}</span>
        <slot name="righe"></slot>

        <div class="due" style="margin-top:var(--space-3)">
          ${this.campo('target', t('Food cost obiettivo (%)'), 'number',
                       t('Da qui esce il prezzo suggerito.'))}
          ${this.campo('prezzo', t('Prezzo di vendita ({v})', { v: simbolo() }), 'number',
                       t('Quello vero, in carta.'))}
        </div>

        <div class="conto">
          <span class="voce">${t('materia prima')}<b>${this.conto.costo}</b></span>
          <span class="voce">${t('suggerito')}<b>${this.conto.suggerito}</b></span>
          <span class="voce ${this.conto.fuoriLinea ? 'storto' : 'buono'}">${t('food cost reale')}<b>${this.conto.foodCost}</b></span>
          <span class="voce ${this.conto.margineNegativo ? 'storto' : 'buono'}">${t('margine')}<b>${this.conto.margine}</b></span>
        </div>

        <span class="etichetta">${t('Allergeni')}</span>
        <div class="chips">
          ${this.allergeniPossibili.map(a => html`
            <cmd-chip ?acceso=${this.allergeni.includes(a)}
                      @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) => {
                        this.allergeni = e.detail.acceso
                          ? this.allergeni.concat(a)
                          : this.allergeni.filter(x => x !== a);
                      }}>${a}</cmd-chip>`)}
        </div>

        <cmd-campo etichetta=${t('Procedimento')}>
          <textarea .value=${this.campi['procedimento'] ?? ''}
                    @input=${(e: Event) => this.scrivi('procedimento', (e.target as HTMLTextAreaElement).value)}></textarea>
        </cmd-campo>
        <cmd-campo etichetta=${t('Note')}
                   aiuto=${t('Varianti, sostituzioni fuori stagione, avvertenze.')}>
          <textarea .value=${this.campi['note'] ?? ''}
                    @input=${(e: Event) => this.scrivi('note', (e.target as HTMLTextAreaElement).value)}></textarea>
        </cmd-campo>

        <cmd-campo etichetta=${t('Foto del piatto')}
                   aiuto=${t('Facoltativa. Viene rimpicciolita prima di essere salvata: una foto da telefono pesa quanto tutto il resto della cucina messo insieme.')}>
          <input type="file" accept="image/*"
                 @change=${(e: Event) => {
                   const f = (e.target as HTMLInputElement).files?.[0];
                   if (f) this.manda('piatto-foto', { file: f });
                 }}>
        </cmd-campo>
        ${this.foto ? html`<img class="miniatura" src=${this.foto} alt=${t('Foto del piatto')}>` : nothing}

        <div class="azioni">
          <cmd-bottone variante="principale" @click=${this.salva}>${t('Salva')}</cmd-bottone>
          <cmd-bottone variante="fantasma"
                       @click=${() => this.manda('piatto-annulla', {})}>${t('Annulla')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-scheda-piatto', SchedaPiatto);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-scheda-sub': SchedaSub;
    'cmd-scheda-piatto': SchedaPiatto;
  }
}
