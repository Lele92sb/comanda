// ============================================================================
// <cmd-squadra> — chi ha accesso all'app, e con quale permesso.
//
// LA DISTINZIONE CHE COSTA PIU' SPIEGAZIONI DI TUTTE: qui ci sono gli ACCOUNT
// che possono aprire Comanda su questa cucina. Chi ci lavora davvero sta in
// Brigata. Le due cose non coincidono, e non e' un difetto: si puo' avere
// accesso senza mai comparire sui turni (il commercialista), ed essere sui
// turni senza avere un account (chi non ha lo smartphone). Sta scritto in
// cima, perche' e' la prima domanda che fa chiunque apra questa schermata.
//
// LE IMPOSTAZIONI DI RISERVATEZZA NON SONO UN RIQUADRO NASCOSTO. Spegnendo
// «Prezzi e food cost» il database SMETTE DI MANDARLI (leggi_sezione): chi ha
// solo lettura non li riceve proprio, non e' che non li vede. Questo componente
// disegna un interruttore; la serratura sta altrove, ed e' giusto cosi'.
//
// I CODICI D'INVITO restano modificabili dopo essere stati consegnati: permesso
// e durata si cambiano senza doverne generare un altro. Chi ha gia' dettato un
// codice al telefono non deve richiamare per dire «no aspetta».
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/etichetta.ts';
import '../ds/interruttore.ts';
import '../ds/riquadro.ts';
import '../ds/scelta.ts';
import type { Opzione } from '../ds/scelta.ts';

export interface MembroVista {
  id: string;
  nome: string;
  email: string;
  /** «sei tu» oppure «dal 12/03/2026». */
  quando: string;
  /** È l'account con cui si sta guardando: il proprio ruolo non si cambia da qui. */
  io: boolean;
  ruolo: string;
}

export interface InvitoVista {
  codice: string;
  ruolo: string;
  /** «scade tra 3 giorni», «senza scadenza». */
  scadenza: string;
}

export interface DurataInvito { valore: string; etichetta: string }

export class Squadra extends LitElement {
  static override properties = {
    membri: { type: Array },
    inviti: { type: Array },
    durate: { type: Array },
    vedeCosti: { type: Boolean },
    vedePersonali: { type: Boolean },
    codiceNuovo: { type: String },
    errore: { type: String },
    inCorso: { type: Boolean },
    ruoloInvito: { type: String, state: true },
    durataInvito: { type: String, state: true },
  };

  declare membri: MembroVista[];
  declare inviti: InvitoVista[];
  declare durate: DurataInvito[];
  declare vedeCosti: boolean;
  declare vedePersonali: boolean;
  /** Il codice appena generato: si mostra grande, per dettarlo. */
  declare codiceNuovo: string;
  declare errore: string;
  declare inCorso: boolean;
  declare ruoloInvito: string;
  declare durataInvito: string;

  constructor() {
    super();
    this.membri = [];
    this.inviti = [];
    this.durate = [];
    this.vedeCosti = false;
    this.vedePersonali = false;
    this.codiceNuovo = '';
    this.errore = '';
    this.inCorso = false;
    this.ruoloInvito = 'editor';
    this.durataInvito = '14';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .membro{
      background:var(--bg-elev2);border-radius:var(--radius-md);
      padding:var(--space-3);margin-bottom:var(--space-2);
    }
    .testa{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3);}
    .nome{font-weight:600;overflow-wrap:anywhere;}
    .riga{font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin-top:3px;overflow-wrap:anywhere;}
    .comandi{flex-shrink:0;min-width:150px;}
    .sotto{display:grid;grid-template-columns:1fr auto;gap:var(--space-2);
      align-items:end;margin-top:var(--space-2);}
    @media(max-width:560px){
      .testa{flex-direction:column;}
      .comandi{min-width:0;width:100%;}
      .sotto{grid-template-columns:1fr;}
    }

    input[type=text]{
      width:100%;
      background:var(--bg);border:1px solid var(--line-strong);color:var(--paper);
      padding:8px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    input[type=text]:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input[type=text]{min-height:var(--tocco-min);} }

    .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .due{grid-template-columns:1fr;} }

    /* Il codice si detta al telefono: grande, spaziato, e con un bordo che dice
       «questo è da leggere ad alta voce». */
    .codice{
      font-family:var(--font-mono);font-size:var(--text-xl);letter-spacing:3px;text-align:center;
      background:var(--bg-elev2);border:1px dashed var(--copper);
      border-radius:var(--radius-md);padding:12px;color:var(--copper-light);
      margin:var(--space-3) 0 var(--space-1);
    }
    .invito{
      background:var(--bg-elev2);border-radius:var(--radius-md);
      padding:var(--space-3);margin-bottom:var(--space-2);
    }
    .invito .testa{align-items:center;}
    .invito .codice{margin:0;padding:6px 10px;font-size:15px;letter-spacing:2px;}
    .nota{font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);
      line-height:1.6;margin:var(--space-1) 0 0;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private get ruoli(): Opzione[] {
    return [
      { valore: 'editor', etichetta: t('può modificare') },
      { valore: 'viewer', etichetta: t('sola lettura') },
    ];
  }

  private get ruoliConTitolare(): Opzione[] {
    return this.ruoli.concat({ valore: 'owner', etichetta: t('titolare') });
  }

  private get opzioniDurata(): Opzione[] {
    return this.durate.map(d => ({ valore: d.valore, etichetta: d.etichetta }));
  }

  private membro(m: MembroVista): TemplateResult {
    return html`
      <div class="membro">
        <div class="testa">
          <div>
            <div class="nome">${m.nome}</div>
            <div class="riga">${m.email}${m.email && m.quando ? ' · ' : ''}${m.quando}</div>
          </div>
          <div class="comandi">
            ${m.io
              ? html`<cmd-etichetta tono="ok">${m.ruolo}</cmd-etichetta>`
              : html`
                <cmd-scelta .opzioni=${this.ruoliConTitolare} valore=${m.ruolo}
                            etichetta=${t('Permesso di {nome}', { nome: m.nome })}
                            @cmd-cambio=${(e: CustomEvent<{ valore: string }>) =>
                              this.manda('membro-ruolo', { id: m.id, ruolo: e.detail.valore })}></cmd-scelta>`}
          </div>
        </div>
        <div class="sotto">
          <input type="text" .value=${m.nome === t('Senza nome') ? '' : m.nome}
                 placeholder=${t('nome nell\'app, es. Marco secondo')}
                 aria-label=${t('Come si chiama nell\'app')}
                 @change=${(e: Event) =>
                   this.manda('membro-nome', { id: m.id, nome: (e.target as HTMLInputElement).value })}>
          ${m.io ? nothing : html`
            <cmd-bottone misura="piccolo" variante="pericolo"
                         @click=${() => this.manda('membro-rimuovi', { id: m.id, nome: m.nome })}
            >${t('Rimuovi dalla cucina')}</cmd-bottone>`}
        </div>
      </div>`;
  }

  private invito(i: InvitoVista): TemplateResult {
    return html`
      <div class="invito">
        <div class="testa">
          <span class="codice">${i.codice}</span>
          <span class="riga" style="margin:0">${i.scadenza}</span>
          <cmd-bottone misura="piccolo" variante="pericolo"
                       etichetta=${t('Annulla il codice {codice}', { codice: i.codice })}
                       @click=${() => this.manda('invito-revoca', { codice: i.codice })}>✕</cmd-bottone>
        </div>
        <div class="due" style="margin-top:var(--space-2)">
          <cmd-scelta .opzioni=${this.ruoli} valore=${i.ruolo} etichetta=${t('Permesso')}
                      @cmd-cambio=${(e: CustomEvent<{ valore: string }>) =>
                        this.manda('invito-ruolo', { codice: i.codice, ruolo: e.detail.valore })}></cmd-scelta>
          <cmd-scelta .opzioni=${this.opzioniDurata} segnaposto=${t('cambia validità')}
                      etichetta=${t('Validità')}
                      @cmd-cambio=${(e: CustomEvent<{ valore: string }>) =>
                        this.manda('invito-giorni', { codice: i.codice, giorni: e.detail.valore })}></cmd-scelta>
        </div>
      </div>`;
  }

  override render(): TemplateResult {
    return html`
      ${this.errore ? html`<cmd-avviso tono="allarme">${this.errore}</cmd-avviso>` : nothing}

      <cmd-riquadro titolo=${t('Chi ha accesso all\'app')}
                    sottotitolo=${t('Sono gli account che possono aprire Comanda su questa cucina. Chi ci lavora davvero si gestisce in Brigata: le due cose non coincidono — puoi avere accesso senza mai essere sui turni, ed essere sui turni senza avere un account.')}>
        ${repeat(this.membri, m => m.id, m => this.membro(m))}
      </cmd-riquadro>

      <cmd-riquadro titolo=${t('Cosa vede chi può modificare')}
                    sottotitolo=${t('Chi ha solo lettura vede i turni pubblicati, le ricette senza numeri e le proprie richieste — e nient\'altro, comunque. Qui decidi quanto mostrare al tuo secondo.')}>
        <cmd-interruttore ?acceso=${this.vedeCosti}
          titolo=${t('Prezzi e food cost')}
          spiega=${t('Prezzi d\'acquisto, food cost, margini, fornitori e fatture. Senza, non può comporre un menu né valutare un piatto.')}
          @cmd-interruttore=${(e: CustomEvent<{ acceso: boolean }>) =>
            this.manda('riservatezza', { campo: 'costi', valore: e.detail.acceso })}></cmd-interruttore>
        <cmd-interruttore ?acceso=${this.vedePersonali}
          titolo=${t('Dati personali della brigata')}
          spiega=${t('Telefono, email e ore contrattuali. Senza, vede nomi, stazioni e quote: quanto basta per fare i turni.')}
          @cmd-interruttore=${(e: CustomEvent<{ acceso: boolean }>) =>
            this.manda('riservatezza', { campo: 'personali', valore: e.detail.acceso })}></cmd-interruttore>
      </cmd-riquadro>

      <cmd-riquadro titolo=${t('Invita qualcuno')}
                    sottotitolo=${t('Genera un codice e daglielo: lo inserisce al primo accesso ed entra con il permesso che scegli tu. Vale per una persona sola, e permesso e durata restano modificabili anche dopo averlo consegnato.')}>
        <div class="due">
          <cmd-campo etichetta=${t('Permesso')} style="margin:0">
            <cmd-scelta .opzioni=${this.ruoli} valore=${this.ruoloInvito}
                        @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => { this.ruoloInvito = e.detail.valore; }}></cmd-scelta>
          </cmd-campo>
          <cmd-campo etichetta=${t('Validità')} style="margin:0">
            <cmd-scelta .opzioni=${this.opzioniDurata} valore=${this.durataInvito}
                        @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => { this.durataInvito = e.detail.valore; }}></cmd-scelta>
          </cmd-campo>
        </div>
        <cmd-bottone style="margin-top:var(--space-3)" pieno variante="principale" ?in-corso=${this.inCorso}
                     @click=${() => this.manda('invito-crea', { ruolo: this.ruoloInvito, giorni: this.durataInvito })}
        >${t('Genera codice')}</cmd-bottone>

        ${this.codiceNuovo ? html`
          <div class="codice">${this.codiceNuovo}</div>
          <p class="nota">${t('Annotalo ora: lo trovi anche nell\'elenco qui sotto, ma è più comodo dettarlo subito.')}</p>` : nothing}

        ${this.inviti.length ? html`
          <p class="nota" style="margin-top:var(--space-4)">${t('Codici ancora validi')}</p>
          ${repeat(this.inviti, i => i.codice, i => this.invito(i))}` : nothing}
      </cmd-riquadro>`;
  }
}

customElements.define('cmd-squadra', Squadra);

declare global {
  interface HTMLElementTagNameMap { 'cmd-squadra': Squadra }
}
