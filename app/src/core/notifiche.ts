// ============================================================================
// LE NOTIFICHE — cosa è successo da quando non guardavi.
//
// Segnalato provando l'app: «non capisco che sta succedendo». In una cucina
// dove lavorano in sei sullo stesso prospetto, le cose cambiano mentre non
// guardi — arriva una richiesta, il titolare ne approva una tua, qualcuno
// pubblica i turni — e l'app non lo diceva. Bisognava andare a controllare, e
// controllare vuol dire ricordarsi di controllare.
//
// NESSUNA TABELLA NUOVA, ed è la scelta che conta. Le notifiche non si
// SALVANO: si CALCOLANO, ogni volta, confrontando i dati che ci sono già con
// un segno di «fin qui avevo visto». Le richieste hanno `created_at` e
// `decisa_il`, i turni pubblicati sono un elenco di date: basta e avanza.
//
// Una tabella `notifiche` sembra la strada ovvia e costa cara: righe che
// crescono per sempre, una scrittura in più per ogni gesto, e il problema
// vero — tenerle allineate a quello che è successo davvero — che si presenta
// il primo giorno in cui una richiesta viene cancellata e la sua notifica
// resta lì. Qui non può succedere: se il dato sparisce, sparisce la notifica.
//
// IL «FIN QUI AVEVO VISTO» STA NEL DISPOSITIVO, non nell'account. È la stessa
// ragione del tema: se guardo dal telefono in cucina e poi dal portatile in
// ufficio, sono due occhiate diverse e vanno ricordate separatamente. Metterlo
// sull'account vorrebbe dire che aprire l'app sul telefono spegne il pallino
// sul portatile, dove non ho ancora letto niente.
//
// NON TOCCA IL DOM: la regola sta qui, con i suoi test, e chi disegna la
// campanella non deve saperla.
// ============================================================================

export type TipoNovita = 'richiesta-nuova' | 'richiesta-decisa' | 'turni-pubblicati';

export interface Novita {
  tipo: TipoNovita;
  /** Quando è successo. Serve a ordinarle: la più fresca in cima. */
  quando: number;
  /** Chi c'entra: il nome di una persona, o vuoto. */
  chi: string;
  /** Quante cose sono: 1 quasi sempre, di più per i turni pubblicati. */
  quante: number;
  /** Dove porta, nella forma che capisce `switchTab`. */
  dove: string;
  /** L'id della richiesta, dove ce n'è una. Serve a non contarla due volte. */
  id?: string;
}

/** Quello che questo modulo deve sapere di una richiesta. */
export interface RichiestaGrezza {
  id: string;
  staff_id: string;
  stato: string;
  created_at?: string | null;
  decisa_il?: string | null;
}

/** Quello che si ricorda fra un'occhiata e l'altra. */
export interface Segno {
  /** Millisecondi: fin qui avevo visto. */
  visto: number;
  /** Le date dei turni che avevo già visto pubblicate. */
  giorniVisti: string[];
}

export const SEGNO_VUOTO: Segno = { visto: 0, giorniVisti: [] };

function quando(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Cosa è successo da quando non guardavi.
 *
 * `mioStaffId` è la persona della brigata collegata a chi sta guardando: serve
 * a non annunciargli le proprie stesse richieste come se fossero novità — che
 * è il modo più veloce di rendere una campanella inutile.
 *
 * `gestisco` dice se questa persona decide sulle richieste altrui. Chi non
 * decide non deve nemmeno sapere che esistono: il database non gliele manda
 * (policy `requests_select`), e qui non si finge il contrario.
 */
export function novita(opzioni: {
  richieste: RichiestaGrezza[];
  giorniPubblicati: string[];
  nomeDi: (staffId: string) => string;
  mioStaffId: string | null;
  gestisco: boolean;
  segno: Segno;
}): Novita[] {
  const { richieste, giorniPubblicati, nomeDi, mioStaffId, gestisco, segno } = opzioni;
  const fuori: Novita[] = [];

  for (const r of richieste || []) {
    const mia = mioStaffId !== null && r.staff_id === mioStaffId;

    // ARRIVATA UNA RICHIESTA. Solo a chi le decide, e mai le proprie: sapere
    // che hai appena mandato una cosa che hai appena mandato non è una notizia.
    if (gestisco && !mia && r.stato === 'in_attesa') {
      const t = quando(r.created_at);
      if (t > segno.visto) {
        fuori.push({ tipo: 'richiesta-nuova', quando: t, chi: nomeDi(r.staff_id),
                     quante: 1, dove: 'richieste', id: r.id });
      }
    }

    // DECISA UNA MIA RICHIESTA. Questa la vuole sapere chi l'ha mandata, ed è
    // l'unica cosa nell'app che qualcuno sta aspettando davvero: finché non
    // arriva non sa se può prenotare il volo.
    if (mia && r.stato !== 'in_attesa') {
      const t = quando(r.decisa_il);
      if (t > segno.visto) {
        fuori.push({ tipo: 'richiesta-decisa', quando: t, chi: r.stato,
                     quante: 1, dove: 'richieste', id: r.id });
      }
    }
  }

  // TURNI PUBBLICATI. Non hanno un momento: l'elenco delle date pubblicate è
  // tutto quello che c'è. Quindi si confronta con quello di prima — le date
  // che compaiono adesso e prima non c'erano sono state pubblicate nel
  // frattempo. È meno preciso di un orario e basta: quello che serve sapere è
  // «ce ne sono di nuovi», non «alle 14:32».
  const primaVisti = new Set(segno.giorniVisti || []);
  const nuovi = (giorniPubblicati || []).filter(g => !primaVisti.has(g));
  if (nuovi.length) {
    fuori.push({ tipo: 'turni-pubblicati', quando: Number.MAX_SAFE_INTEGER,
                 chi: '', quante: nuovi.length, dove: 'turni' });
  }

  // La più fresca in cima. I turni pubblicati stanno sempre per primi perché
  // non hanno un momento e non c'è modo di collocarli: è la scelta onesta fra
  // metterli in fondo per sempre e inventarsi un orario.
  return fuori.sort((a, b) => b.quando - a.quando);
}

/** Il segno da salvare dopo aver guardato. Congela l'adesso e i giorni visti. */
export function segnaVisto(adesso: number, giorniPubblicati: string[]): Segno {
  return { visto: adesso, giorniVisti: [...(giorniPubblicati || [])] };
}
