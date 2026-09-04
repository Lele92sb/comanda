// ============================================================================
// <cmd-costo-servizio> — la domanda del lunedì mattina.
//
// «Sabato ho guadagnato o no?» Oggi ci si risponde con un foglio di carta,
// perché nessun programma ha tutte e due le metà del conto: chi fa i turni sa
// quanto è costato il personale, chi fa il food cost sa quanto costa un piatto.
// Qui ci sono tutte e due, e la riga grossa in cima non è il costo — è
// L'INCASSO CHE SERVE A PAGARLO, che è la sola forma in cui quel numero
// diventa una decisione.
//
// PERCHÉ NON BASTA SOMMARE. Se il personale costa 812 € non basta incassarne
// 812: di ogni euro che entra, una parte se ne va in merce. Al 30% di food
// cost servono 1.160 €. Chi somma e basta sbaglia di 348 € — e sempre per
// difetto, cioè dalla parte che fa male.
//
// UN CONTO PARZIALE LO DICE. Se qualcuno non ha la tariffa oraria il totale è
// più basso del vero, e un numero più basso del vero in un riquadro che si
// chiama «costo del periodo» non lo mette in dubbio nessuno. Quindi si dice
// chi manca, per nome, e il numero resta lì dichiarato incompleto invece di
// sparire: metà conto è comunque meglio di nessun conto, purché si sappia.
//
// NON CALCOLA E NON FORMATTA. Riceve stringhe già pronte, come ogni altra
// vista: la valuta, la lingua e le tariffe sono affari del collante. Così sta
// nel banco in tutti i suoi stati senza che esista una cucina.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/riquadro.ts';
import '../ds/avviso.ts';
import '../ds/vuoto.ts';

export interface RigaCostoGiorno {
  /** Come si legge: «sab 4». */
  etichetta: string;
  ore: string;
  costo: string;
  /** 0…1 — quanto pesa questo giorno sul più caro del periodo. */
  quota: number;
  /** false se quel giorno ha lavorato qualcuno senza tariffa. */
  completo: boolean;
  /** Per far risaltare il fine settimana, che è dove si guadagna. */
  weekend: boolean;
}

export class CmdCostoServizio extends LitElement {
  static override properties = {
    costo:         { type: String },
    ore:           { type: String },
    /** L'incasso minimo per coprire il lavoro. Vuoto = non si può dire. */
    pareggio:      { type: String },
    /** Il food cost obiettivo con cui è stato calcolato: «30%». */
    foodCost:      { type: String },
    giorni:        { type: Array },
    /** I nomi di chi ha lavorato senza tariffa. */
    senzaTariffa:  { type: Array },
    /** Nessuna tariffa impostata: non è un errore, è il primo passo. */
    vuoto:         { type: Boolean },
    /** Chi vede i costi ma non le persone: il totale sì, il dettaglio no. */
    soloTotale:    { type: Boolean },
    /** Chi non può modificare la brigata non va mandato a impostare tariffe. */
    soloLettura:   { type: Boolean },
  };

  declare costo: string;
  declare ore: string;
  declare pareggio: string;
  declare foodCost: string;
  declare giorni: RigaCostoGiorno[];
  declare senzaTariffa: string[];
  declare vuoto: boolean;
  declare soloTotale: boolean;
  declare soloLettura: boolean;

  constructor(){
    super();
    this.costo = '—';
    this.ore = '';
    this.pareggio = '';
    this.foodCost = '';
    this.giorni = [];
    this.senzaTariffa = [];
    this.vuoto = false;
    this.soloTotale = false;
    this.soloLettura = false;
  }

  static override styles = css`
    :host{ display:block; }
    *,*::before,*::after{ box-sizing:border-box; }

    /* La riga che risponde alla domanda. La cifra e' in Fraunces come i numeri
       della dashboard: quello che si legge da lontano e' scritto col
       carattere dei titoli, non con quello del corpo. */
    .pareggio{
      display:flex; flex-wrap:wrap; align-items:baseline; gap:var(--space-3);
      padding:var(--space-4); border-radius:var(--radius-md);
      background:var(--bg-elev2); border:1px solid var(--line);
      margin-bottom:var(--space-4);
    }
    .pareggio .cifra{
      font-family:var(--font-display); font-size:28px; font-weight:700;
      color:var(--copper-light); line-height:1.2;
    }
    .pareggio .frase{ color:var(--brass); font-size:var(--text-sm); line-height:1.5; flex:1 1 16rem; }

    .conti{ display:flex; flex-wrap:wrap; gap:var(--space-5); margin-bottom:var(--space-4); }
    .conto .valore{ font-family:var(--font-display); font-size:var(--text-xl); font-weight:600; }
    .conto .nome{ font-size:var(--text-sm); color:var(--brass); }

    /* Le barre: l'unica cosa che si legge senza leggere. Chi guarda un
       prospetto vuole sapere QUALE giorno costa, non quanto costa ognuno. */
    .giorni{ display:flex; flex-direction:column; gap:var(--space-1); margin-top:var(--space-4); }
    .riga{ display:grid; grid-template-columns:4.5rem 1fr auto; align-items:center; gap:var(--space-3); }
    .riga .quando{ font-size:var(--text-sm); color:var(--brass); }
    .riga.weekend .quando{ color:var(--paper); font-weight:600; }
    .barra{ height:8px; border-radius:var(--radius-sm); background:var(--bg-elev2); overflow:hidden; }
    .barra > i{ display:block; height:100%; background:var(--copper); border-radius:inherit; }
    /* Un giorno con un buco nei dati non deve sembrare un giorno economico. */
    .riga.parziale .barra > i{
      background:repeating-linear-gradient(45deg,
        var(--copper) 0 4px, var(--copper-soft) 4px 8px);
    }
    .riga .quanto{ font-variant-numeric:tabular-nums; font-size:var(--text-sm); }

    .nota{ margin:var(--space-3) 0 0; font-size:var(--text-sm); line-height:1.5; color:var(--brass); }
  `;

  override render(): TemplateResult {
    return html`
      <cmd-riquadro titolo=${t('Quanto costa questo periodo')}>
        ${this.vuoto ? this.primoPasso() : this.conto()}
      </cmd-riquadro>`;
  }

  private primoPasso(): TemplateResult {
    return html`
      <cmd-vuoto
        titolo=${t('Non c’è ancora nessun costo orario')}
        spiega=${this.soloLettura
          ? t('Quando il titolare avrà impostato i costi orari della brigata, qui comparirà quanto costa ogni servizio e quanto bisogna incassare per pagarselo.')
          : t('Imposta il costo orario di ogni persona in Brigata e qui comparirà quanto costa ogni servizio — e quanto bisogna incassare per pagarselo. È il conto che nessun altro programma sa fare: chi gestisce i turni non conosce il food cost, e chi conosce il food cost non sa cosa sia un turno.')}>
      </cmd-vuoto>`;
  }

  private conto(): TemplateResult {
    return html`
      ${this.pareggio ? html`
        <div class="pareggio">
          <span class="cifra">${this.pareggio}</span>
          <span class="frase">
            ${t('è quanto devi incassare in questo periodo per pagare il personale, tenuto conto che la merce si porta via il {quota} dell’incasso.',
                { quota: this.foodCost })}
          </span>
        </div>` : nothing}

      <div class="conti">
        <div class="conto">
          <div class="valore">${this.costo}</div>
          <div class="nome">${t('costo del personale')}</div>
        </div>
        <div class="conto">
          <div class="valore">${this.ore}</div>
          <div class="nome">${t('ore pianificate')}</div>
        </div>
      </div>

      ${this.senzaTariffa.length ? html`
        <cmd-avviso tono="allarme">
          ${t('Il conto è parziale: manca il costo orario di {chi}. Il totale qui sopra è più basso del vero.',
              { chi: this.senzaTariffa.join(', ') })}
        </cmd-avviso>` : nothing}

      ${!this.pareggio && !this.vuoto ? html`
        <p class="nota">${t('Per dire quanto incassare servirebbe il food cost obiettivo dei piatti: impostalo nel ricettario e questo riquadro lo userà.')}</p>` : nothing}

      ${this.soloTotale ? html`
        <p class="nota">${t('Vedi il totale del periodo, non quanto costa ogni persona: per quello servono anche i dati personali della brigata.')}</p>` : nothing}

      ${this.giorni.length ? html`
        <div class="giorni">
          ${this.giorni.map(g => html`
            <div class="riga ${g.weekend ? 'weekend' : ''} ${g.completo ? '' : 'parziale'}">
              <span class="quando">${g.etichetta}</span>
              <span class="barra"><i style="width:${Math.round(g.quota * 100)}%"></i></span>
              <span class="quanto">${g.costo}</span>
            </div>`)}
        </div>` : nothing}`;
  }
}

customElements.define('cmd-costo-servizio', CmdCostoServizio);

declare global {
  interface HTMLElementTagNameMap { 'cmd-costo-servizio': CmdCostoServizio }
}
