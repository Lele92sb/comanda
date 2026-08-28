// ============================================================================
// Console di amministrazione — l'unico punto da cui parla col database.
//
// Regola di questo file: SOLO chiamate a funzioni (rpc), mai letture dirette
// di tabelle. Non è pignoleria — le funzioni in supabase/admin.sql controllano
// i permessi come prima istruzione e scrivono nel registro; una query diretta
// salterebbe entrambe le cose, e il giorno che una policy fosse scritta male
// sarebbe l'unica strada che non se ne accorge. C'è un test che verifica che
// in questa cartella non compaia nessun .from().
//
// L'elenco delle chiamate ammesse è chiuso e sta qui sotto: aggiungerne una è
// una decisione, non una riga scritta di passaggio.
// ============================================================================
import { Cloud } from '../lib/cloud.js';

export const CHIAMATE = [
  'is_platform_admin',
  'admin_numeri', 'admin_iscrizioni', 'admin_cucine', 'admin_account',
  'admin_cucina', 'admin_registro',
  'admin_set_stato', 'admin_set_prova', 'admin_set_ai', 'admin_set_ruolo',
  'admin_rimuovi_membro', 'admin_trasferisci_proprieta',
  'admin_cancella_cucina', 'admin_ripristina_cucina', 'admin_elimina_definitivamente',
  'admin_errori_gruppi', 'admin_errori', 'admin_pulisci_errori',
  'admin_apri_assistenza', 'admin_chiudi_assistenza', 'admin_assistenze',
];

async function chiama(nome, argomenti){
  if(!CHIAMATE.includes(nome)) throw new Error('Chiamata non prevista: ' + nome);
  const { data, error } = await Cloud.client.rpc(nome, argomenti || {});
  if(error) throw error;
  return data;
}

// --------------------------------------------------------------------------
// La porta
// --------------------------------------------------------------------------
/**
 * Sei amministratore della piattaforma?
 *
 * Chiude in caso di dubbio, sempre. Un errore qui può voler dire tre cose —
 * la console non è installata, la sessione è scaduta, la rete è caduta — e
 * nessuna delle tre è "sì". Solo un `true` secco apre.
 */
export async function sonoAmministratore(){
  try{
    const { data, error } = await Cloud.client.rpc('is_platform_admin', {});
    if(error) return false;
    return data === true;
  }catch(e){
    return false;
  }
}

// --------------------------------------------------------------------------
// Impaginazione a chiave
//
// Si riparte dall'ULTIMA RIGA VISTA, non dalla posizione: con l'offset la
// pagina 5.000 costa quanto scorrere le 4.999 che la precedono.
//
// Le due parti del cursore vanno SEMPRE insieme. Con la sola data, due righe
// nato lo stesso istante — due cucine create dallo stesso script, due errori
// dello stesso ciclo — si perdono o si ripetono: la pagina dopo riparte da
// "minore di quell'istante" e si porta via anche la gemella che non era ancora
// stata mostrata.
// --------------------------------------------------------------------------
/**
 * Il cursore per la pagina successiva, oppure null se la pagina è finita.
 * Una pagina più corta del limite è l'ultima: non c'è altro da chiedere.
 */
export function prossimoCursore(righe, limite, campoTempo, campoId){
  if(!righe || righe.length < limite) return null;
  const ultima = righe[righe.length - 1];
  if(ultima[campoTempo] == null || ultima[campoId] == null) return null;
  return { quando: ultima[campoTempo], id: ultima[campoId] };
}

// --------------------------------------------------------------------------
// Chi è la persona
//
// Per id esplicito oppure per email, mai per differenza da chi sta agendo.
// In questo progetto è già successo di declassare il titolare sbagliato
// usando un identificatore non aggiornato: se non c'è un'indicazione, qui non
// si indovina, ci si ferma.
// --------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bersaglio(indicazione){
  const s = String(indicazione == null ? '' : indicazione).trim();
  if(!s) throw new Error('Indica la persona con la sua email o il suo id.');
  return UUID.test(s) ? { p_user: s, p_email: null } : { p_user: null, p_email: s };
}

// --------------------------------------------------------------------------
// Vedere
// --------------------------------------------------------------------------
export const numeri      = () => chiama('admin_numeri');
export const iscrizioni  = (giorni) => chiama('admin_iscrizioni', { p_giorni: giorni });
export const cucina      = (id) => chiama('admin_cucina', { p_kitchen: id });
export const assistenze  = (id) => chiama('admin_assistenze', { p_kitchen: id });

export function cucine({ cerca, stato, cancellate, limite, cursore } = {}){
  return chiama('admin_cucine', {
    p_cerca: cerca || null,
    p_stato: stato || null,
    p_cancellate: !!cancellate,
    p_limite: limite,
    p_dopo_creata: cursore ? cursore.quando : null,
    p_dopo_id: cursore ? cursore.id : null,
  });
}

export function account({ cerca, limite, cursore } = {}){
  return chiama('admin_account', {
    p_cerca: cerca || null,
    p_limite: limite,
    p_dopo_creato: cursore ? cursore.quando : null,
    p_dopo_id: cursore ? cursore.id : null,
  });
}

export function registro({ cucinaId, limite, cursore } = {}){
  return chiama('admin_registro', {
    p_cucina: cucinaId || null,
    p_limite: limite,
    p_dopo_quando: cursore ? cursore.quando : null,
    p_dopo_id: cursore ? cursore.id : null,
  });
}

export function erroriGruppi({ giorni, versione, cucinaId, limite } = {}){
  return chiama('admin_errori_gruppi', {
    p_giorni: giorni, p_versione: versione || null,
    p_cucina: cucinaId || null, p_limite: limite,
  });
}

export function errori({ impronta, versione, cucinaId, cerca, giorni, limite, cursore } = {}){
  return chiama('admin_errori', {
    p_impronta: impronta || null,
    p_versione: versione || null,
    p_cucina: cucinaId || null,
    p_cerca: cerca || null,
    p_giorni: giorni,
    p_limite: limite,
    p_dopo_quando: cursore ? cursore.quando : null,
    p_dopo_id: cursore ? cursore.id : null,
  });
}

// --------------------------------------------------------------------------
// Agire — ognuna lascia una riga nel registro, e la scrive il database
// --------------------------------------------------------------------------
export const setStato = (id, stato, scadenza) =>
  chiama('admin_set_stato', { p_kitchen: id, p_stato: stato, p_trial_ends_at: scadenza || null });

export const setProva = (id, scadenza) =>
  chiama('admin_set_prova', { p_kitchen: id, p_scadenza: scadenza });

export const setAi = (id, tetto, azzera) =>
  chiama('admin_set_ai', { p_kitchen: id, p_limite: tetto == null ? null : tetto, p_azzera: !!azzera });

export const setRuolo = (id, ruolo, chi) =>
  chiama('admin_set_ruolo', { p_kitchen: id, p_ruolo: ruolo, ...bersaglio(chi) });

export const rimuoviMembro = (id, chi) =>
  chiama('admin_rimuovi_membro', { p_kitchen: id, ...bersaglio(chi) });

// Il vecchio titolare si nomina, o non viene declassato nessuno: "tutti quelli
// diversi dal nuovo" è la scorciatoia che toglie il ruolo alla persona
// sbagliata, ed è già successo.
export function trasferisciProprieta(id, nuovo, vecchio, declassaA){
  const n = bersaglio(nuovo);
  const v = vecchio ? bersaglio(vecchio) : { p_user: null, p_email: null };
  return chiama('admin_trasferisci_proprieta', {
    p_kitchen: id,
    p_nuovo_user: n.p_user, p_nuovo_email: n.p_email,
    p_vecchio_user: v.p_user, p_vecchio_email: v.p_email,
    p_declassa_a: declassaA || 'editor',
  });
}

export const cancellaCucina   = (id, motivo) => chiama('admin_cancella_cucina', { p_kitchen: id, p_motivo: motivo || null });
export const ripristinaCucina = (id, stato)  => chiama('admin_ripristina_cucina', { p_kitchen: id, p_stato: stato || 'suspended' });
export const eliminaCucina    = (id, nome)   => chiama('admin_elimina_definitivamente', { p_kitchen: id, p_conferma_nome: nome });

export const apriAssistenza   = (id, motivo, minuti) =>
  chiama('admin_apri_assistenza', { p_kitchen: id, p_motivo: motivo, p_minuti: minuti });
export const chiudiAssistenza = (idAccesso) => chiama('admin_chiudi_assistenza', { p_id: idAccesso });

export const pulisciErrori = (giorni) => chiama('admin_pulisci_errori', { p_giorni: giorni });
