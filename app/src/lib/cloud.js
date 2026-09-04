// ============================================================================
// Comanda — livello account e dati condivisi.
//
// Espone due sole cose al resto dell'app:
//   Cloud.*          → login, cucine, ruoli
//   storageGet/Set   → lettura e scrittura dei dati, identiche a prima
//
// Il resto dell'app (ricettario, turni, food cost) non sa se sta parlando con
// localStorage o con il database: chiama sempre le stesse due funzioni.
//
// Due modalità, decise da app/config.js:
//   LOCALE — nessuna configurazione: dati nel browser, come la prima versione.
//   CLOUD  — Supabase: login, dati condivisi per cucina, ruoli editor/viewer.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { COMANDA_CONFIG as cfg } from './config.js';
import { differenze, differenzeCelle } from './differenze.js';

const CLOUD_ENABLED = !!(cfg.SUPABASE_URL && cfg.SUPABASE_PUBLIC_KEY);

// Chiavi che restano personali del singolo utente anche in una cucina condivisa:
// la conversazione con l'assistente è un dialogo privato, non un dato di cucina.
const PERSONAL_KEYS = ['chatHistory'];

// In modalità cloud test e produzione sono già separati perché puntano a due
// progetti Supabase diversi. In modalità locale la separazione la fa il
// prefisso di storage (localStorage è per-dominio, non per-cartella).
const IS_STAGING = !!cfg.IS_TEST;
const LS_PREFIX = IS_STAGING ? 'comanda_staging_' : 'comanda_';

const Cloud = {
  enabled: CLOUD_ENABLED,
  isStaging: IS_STAGING,
  client: null,
  user: null,
  kitchen: null,      // {id, name, status, trial_ends_at}
  role: 'editor',     // in modalità locale sei sempre tu, quindi puoi scrivere
  memberships: [],
  versions: {},       // key → versione nota, per non sovrascrivere il lavoro altrui
  onConflict: null,   // impostata dall'app: cosa fare se un collega ha salvato prima
};

Cloud.canWrite = function(){ return Cloud.role === 'owner' || Cloud.role === 'editor'; };
Cloud.isOwner  = function(){ return Cloud.role === 'owner'; };
/* Chi decide sulle richieste degli altri: il titolare, piu' chi ha il permesso.
   Il titolare ce l'ha sempre senza che nessuno glielo accenda — e' gia' suo per
   via del ruolo, e doverglielo dare sarebbe un modo di dimenticarselo.

   Qui e' solo per NON MOSTRARE porte che dietro non hanno niente: a difendere
   c'e' la policy `gestisce_richieste` nel database, che e' l'unica che conta. */
Cloud.puoDecidereRichieste = function(){
  return Cloud.role === 'owner' || Cloud.gestisceRichieste === true;
};

// --------------------------------------------------------------------------
// Avvio: in cloud crea il client e recupera la sessione già attiva (se c'è).
// --------------------------------------------------------------------------
Cloud.init = async function(){
  if(!CLOUD_ENABLED) return { mode:'local' };
  Cloud.client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLIC_KEY);
  const { data } = await Cloud.client.auth.getSession();
  Cloud.user = data.session ? data.session.user : null;
  return { mode:'cloud', signedIn: !!Cloud.user };
};

// --------------------------------------------------------------------------
// Autenticazione
// --------------------------------------------------------------------------
Cloud.signUp = async function(email, password){
  const { data, error } = await Cloud.client.auth.signUp({ email, password });
  if(error) throw error;
  Cloud.user = data.user;
  // Se il progetto Supabase richiede la conferma via email, la sessione non
  // esiste ancora: l'app mostra "controlla la posta" invece di entrare.
  return { needsConfirmation: !data.session };
};

Cloud.signIn = async function(email, password){
  const { data, error } = await Cloud.client.auth.signInWithPassword({ email, password });
  if(error) throw error;
  Cloud.user = data.user;
};

Cloud.signOut = async function(){
  await Cloud.client.auth.signOut();
  Cloud.user = null; Cloud.kitchen = null; Cloud.memberships = []; Cloud.versions = {};
};

Cloud.resetPassword = async function(email){
  const { error } = await Cloud.client.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  if(error) throw error;
};

// --------------------------------------------------------------------------
// Cucine e ruoli
// --------------------------------------------------------------------------
// Il filtro su user_id è obbligatorio, non un'ottimizzazione: un membro può
// legittimamente vedere i colleghi della sua cucina, quindi senza filtro qui
// tornerebbero anche le loro righe e si finirebbe per leggere il ruolo di
// qualcun altro (un invitato in sola lettura si ritroverebbe titolare).
Cloud.loadMemberships = async function(){
  const { data, error } = await Cloud.client
    .from('kitchen_members')
    .select('role, display_name, gestisce_richieste, kitchen:kitchens(id, name, status, trial_ends_at, editor_vede_costi, editor_vede_personali)')
    .eq('user_id', Cloud.user.id)
    .order('created_at', { ascending: true });
  if(error) throw error;
  Cloud.memberships = (data||[]).filter(m=>m.kitchen);
  return Cloud.memberships;
};

Cloud.selectKitchen = function(kitchenId){
  const m = Cloud.memberships.find(x=>x.kitchen.id === kitchenId);
  if(!m) throw new Error('Cucina non trovata tra le tue');
  Cloud.kitchen = m.kitchen;
  Cloud.role = m.role;
  // `=== true` e non `||`: finche' la migrazione non e' applicata la colonna
  // non c'e' e il campo arriva `undefined`. Cosi' vale «no», che e' il
  // comportamento di prima — l'app funziona lo stesso, semplicemente il
  // permesso non lo ha nessuno.
  Cloud.gestisceRichieste = m.gestisce_richieste === true;
  Cloud.myDisplayName = m.display_name || null;
  Cloud.versions = {};
  try{ localStorage.setItem(LS_PREFIX+'last_kitchen', kitchenId); }catch(e){}
};

Cloud.lastKitchenId = function(){
  try{ return localStorage.getItem(LS_PREFIX+'last_kitchen'); }catch(e){ return null; }
};

Cloud.createKitchen = async function(name, nomeInCucina){
  const { data, error } = await Cloud.client.rpc('create_kitchen',
    { p_name: name, p_display_name: nomeInCucina || null });
  if(error) throw error;
  await Cloud.loadMemberships();
  Cloud.selectKitchen(data);
  return data;
};

Cloud.joinKitchen = async function(code, nomeInCucina){
  const { data, error } = await Cloud.client.rpc('join_kitchen',
    { p_code: code, p_display_name: nomeInCucina || null });
  if(error) throw error;
  await Cloud.loadMemberships();
  Cloud.selectKitchen(data);
  return data;
};

// Il nome con cui gli altri ti vedono in questa cucina.
Cloud.setMyDisplayName = async function(nome){
  const { error } = await Cloud.client.rpc('set_my_display_name',
    { p_kitchen: Cloud.kitchen.id, p_name: nome });
  if(error) throw error;
  Cloud.myDisplayName = (nome||'').trim() || null;
};

// Il titolare può correggere il nome di chiunque: se un collega scrive
// "aiuto1" o niente, deve poter mettere qualcosa di riconoscibile.
Cloud.setMemberName = async function(userId, nome){
  const { data, error } = await Cloud.client.from('kitchen_members')
    .update({ display_name: (nome||'').trim() || null })
    .eq('kitchen_id', Cloud.kitchen.id).eq('user_id', userId)
    .select('user_id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per rinominare le persone.');
};

/* Dare o togliere il permesso sulle richieste. Solo il titolare ci riesce: a
   fermare chi non lo e' non e' questa funzione ma la policy `members_write`,
   che chiede il ruolo di titolare per scrivere su `kitchen_members`. Qui si
   controlla solo che la scrittura sia andata a segno — se torna zero righe,
   RLS ha detto di no, e va detto invece di far finta di niente. */
Cloud.setMemberGestisceRichieste = async function(userId, acceso){
  const { data, error } = await Cloud.client.from('kitchen_members')
    .update({ gestisce_richieste: !!acceso })
    .eq('kitchen_id', Cloud.kitchen.id).eq('user_id', userId)
    .select('user_id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per cambiare questo.');
};

Cloud.listMembers = async function(){
  const { data, error } = await Cloud.client
    .from('kitchen_members')
    .select('user_id, role, display_name, email, created_at, gestisce_richieste')
    .eq('kitchen_id', Cloud.kitchen.id)
    .order('created_at', { ascending: true });
  if(error) throw error;
  return data||[];
};

// Nota su tutte le scritture qui sotto: quando le policy RLS non concedono il
// permesso, la riga semplicemente non risulta visibile all'operazione e
// Postgres non solleva nessun errore — l'operazione "riesce" senza fare niente.
// Per questo ogni scrittura chiede indietro le righe toccate con .select() e
// verifica che ce ne sia almeno una: meglio un errore chiaro di un falso "fatto".
// Impostazioni di riservatezza della cucina. Vivono sulla riga della cucina,
// non nei suoi dati: chi può modificare può scrivere i dati, e se stessero lì
// potrebbe alzarsi i permessi da solo.
Cloud.setRiservatezza = async function({ costi, personali }){
  const patch = {};
  if(costi !== undefined) patch.editor_vede_costi = costi;
  if(personali !== undefined) patch.editor_vede_personali = personali;
  const { data, error } = await Cloud.client
    .from('kitchens').update(patch).eq('id', Cloud.kitchen.id)
    .select('editor_vede_costi, editor_vede_personali');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Solo chi gestisce la cucina può cambiare queste impostazioni.');
  Object.assign(Cloud.kitchen, data[0]);
};

Cloud.setMemberRole = async function(userId, role){
  const { data, error } = await Cloud.client
    .from('kitchen_members').update({ role })
    .eq('kitchen_id', Cloud.kitchen.id).eq('user_id', userId)
    .select('user_id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per cambiare i ruoli.');
};

Cloud.removeMember = async function(userId){
  const { data, error } = await Cloud.client
    .from('kitchen_members').delete()
    .eq('kitchen_id', Cloud.kitchen.id).eq('user_id', userId)
    .select('user_id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per rimuovere persone.');
};

function inviteCode(){
  // Alfabeto senza caratteri ambigui (0/O, 1/I): questi codici si dettano a voce.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b=>alphabet[b % alphabet.length]).join('');
}

// giorni: numero di giorni di validità, oppure null per "senza scadenza".
Cloud.expiryFromDays = function(giorni){
  if(giorni === null || giorni === '' || giorni === undefined) return null;
  const d = new Date();
  d.setDate(d.getDate() + parseInt(giorni, 10));
  return d.toISOString();
};

Cloud.createInvite = async function(role, giorni){
  const code = inviteCode();
  const { data, error } = await Cloud.client.from('kitchen_invites').insert({
    code, kitchen_id: Cloud.kitchen.id, role, created_by: Cloud.user.id,
    expires_at: Cloud.expiryFromDays(giorni)
  }).select('code');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per invitare persone.');
  return code;
};

// Cambia permesso e/o scadenza di un codice già consegnato: chi lo ha in mano
// non deve riceverne un altro, quello che ha continua a valere alle nuove
// condizioni. La nuova durata si conta da adesso, non dalla creazione.
Cloud.updateInvite = async function(code, campi){
  const patch = {};
  if(campi.role) patch.role = campi.role;
  if('giorni' in campi) patch.expires_at = Cloud.expiryFromDays(campi.giorni);
  const { data, error } = await Cloud.client
    .from('kitchen_invites').update(patch).eq('code', code).select('code');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per modificare questo invito.');
};

Cloud.listInvites = async function(){
  const { data, error } = await Cloud.client
    .from('kitchen_invites')
    .select('code, role, expires_at, used_by, used_at')
    .eq('kitchen_id', Cloud.kitchen.id)
    .order('created_at', { ascending:false });
  if(error) throw error;
  return data||[];
};

// Un invito è ancora spendibile se non è stato usato e non è scaduto.
// expires_at NULL = senza scadenza.
Cloud.inviteIsPending = function(inv){
  if(inv.used_by) return false;
  return !inv.expires_at || new Date(inv.expires_at) > new Date();
};

Cloud.revokeInvite = async function(code){
  const { data, error } = await Cloud.client
    .from('kitchen_invites').delete().eq('code', code).select('code');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per annullare questo invito.');
};

// Blocco d'uso: 'suspended' o trial scaduto. Il controllo vero è comunque lato
// server (le funzioni AI) e lato database; qui serve solo a spiegarlo a schermo.
Cloud.accessBlock = function(){
  if(!CLOUD_ENABLED || !Cloud.kitchen) return null;
  if(Cloud.kitchen.status === 'suspended') return 'suspended';
  if(Cloud.kitchen.status === 'trial' && Cloud.kitchen.trial_ends_at &&
     new Date(Cloud.kitchen.trial_ends_at) < new Date()) return 'trial_expired';
  return null;
};

// --------------------------------------------------------------------------
// Dati — stessa interfaccia in entrambe le modalità
// --------------------------------------------------------------------------
function localGet(key){
  try{
    const raw = localStorage.getItem(LS_PREFIX+key);
    return raw !== null ? JSON.parse(raw) : null;
  }catch(e){ console.error('lettura locale fallita', key, e); return null; }
}
function localSet(key, value){
  try{ localStorage.setItem(LS_PREFIX+key, JSON.stringify(value)); return true; }
  catch(e){ console.error('scrittura locale fallita', key, e); return false; }
}

/* ============================================================================
   LE SEZIONI CHE HANNO GIA' UNA TABELLA VERA.

   Il passaggio dai blob JSON alle tabelle si fa UNA SEZIONE ALLA VOLTA, e
   questo elenco dice a che punto siamo. Il resto dell'app non se ne accorge:
   chiede `state.ingredients` e riceve un array, esattamente come prima.

   Il piano completo, e la ragione per cui i dati riservati stanno in una
   tabella SEPARATA invece che in una colonna nascosta, sta in
   supabase/PIANO-modello-dati.md.
   ============================================================================ */
/* I campi che decidono se un ingrediente e' cambiato. Elenco esplicito e non
   «tutti»: le righe che tornano dal database si portano dietro roba che il
   client non ha (`aggiornato_il`), e confrontarla farebbe risultare cambiato
   tutto a ogni giro. */
const CAMPI_INGREDIENTE = ['name', 'unit', 'price', 'supplier', 'yieldPct', 'yieldEstimated'];

/* Per una persona si guardano anche `stations` e `weeklyQuota`, che sono
   liste: il confronto passa dal JSON, che per liste corte come queste e'
   esatto e costa niente. */
const CAMPI_PERSONA = ['name', 'role', 'hours', 'phone', 'email', 'puoFareExtra', 'userId',
                       'stations', 'weeklyQuota'];

const SEZIONI_IN_TABELLA = {
  ingredients: {
    async leggi(){
      const { data, error } = await Cloud.client.rpc('leggi_ingredienti',
        { p_kitchen: Cloud.kitchen.id });
      if(error) throw error;
      // `yieldPct` e `price` arrivano come numeri: l'app li ha sempre trattati
      // come stringhe o numeri indifferentemente (`parseFloat` dappertutto),
      // quindi non c'e' niente da convertire.
      return data || [];
    },
    /* Scrive SOLO quello che e' cambiato. E' il punto di tutto questo lavoro:
       prima ogni salvataggio riscriveva l'elenco intero — a 5.000 ingredienti,
       620 KB per cambiare un prezzo. Il confronto sta in `lib/differenze.js`,
       dove ha dei test: la prima versione era qui dentro e sbagliava proprio
       il caso piu' comune. */
    async scrivi(nuovi, precedenti){
      const { daScrivere, daTogliere } = differenze(nuovi, precedenti, CAMPI_INGREDIENTE);

      if(daScrivere.length){
        // UNA chiamata sola, anche per cinquanta. Importando una fattura
        // elettronica ne nascono anche cinquanta insieme, e cinquanta chiamate
        // in fila su un telefono col wifi che balla sono venti secondi di
        // schermata ferma.
        const { error } = await Cloud.client.rpc('salva_ingredienti', {
          p_kitchen: Cloud.kitchen.id,
          p_righe: daScrivere.map(i => ({
            id: i.id, name: i.name || '', unit: i.unit || 'kg',
            yieldPct: parseFloat(i.yieldPct) || 100,
            yieldEstimated: !!i.yieldEstimated,
            price: i.price === '' || i.price == null ? null : parseFloat(i.price),
            supplier: i.supplier || null,
          })),
        });
        if(error) throw error;
      }

      for(const id of daTogliere){
        const { error } = await Cloud.client.from('ingredienti')
          .delete().eq('kitchen_id', Cloud.kitchen.id).eq('id', id);
        if(error) throw error;
      }
      return true;
    },
  },

  staff: {
    async leggi(){
      const { data, error } = await Cloud.client.rpc('leggi_persone',
        { p_kitchen: Cloud.kitchen.id });
      if(error) throw error;
      return data || [];
    },
    async scrivi(nuovi, precedenti){
      const { daScrivere, daTogliere } = differenze(nuovi, precedenti, CAMPI_PERSONA);

      if(daScrivere.length){
        const { error } = await Cloud.client.rpc('salva_persone', {
          p_kitchen: Cloud.kitchen.id,
          p_righe: daScrivere.map(p => ({
            id: p.id, name: p.name || '', role: p.role || null,
            stations: p.stations || [], weeklyQuota: p.weeklyQuota || [],
            puoFareExtra: p.puoFareExtra !== false,
            phone: p.phone || null, email: p.email || null,
            hours: p.hours === '' || p.hours == null ? null : parseFloat(p.hours),
            userId: p.userId || null,
          })),
        });
        if(error) throw error;
      }

      for(const id of daTogliere){
        const { error } = await Cloud.client.from('persone')
          .delete().eq('kitchen_id', Cloud.kitchen.id).eq('id', id);
        if(error) throw error;
      }
      return true;
    },
  },

  /* I TURNI hanno una forma loro: non un elenco, ma la mappa
     {personaId: {giorno: cella}} che l'app usa da sempre. Il database tiene
     righe piatte — una per cella — e qui si ricompone. */
  shifts: {
    async leggi(){
      const { data, error } = await Cloud.client.rpc('leggi_turni',
        { p_kitchen: Cloud.kitchen.id });
      if(error) throw error;
      const mappa = {};
      for(const r of data || []){
        (mappa[r.staff_id] = mappa[r.staff_id] || {})[r.giorno] =
          { code: r.code, stations: r.stations || {} };
      }
      return mappa;
    },
    async scrivi(nuove, precedenti){
      const { daScrivere, daTogliere } = differenzeCelle(nuove, precedenti);
      if(!daScrivere.length && !daTogliere.length) return true;
      // Una chiamata sola: dopo una generazione mensile ne cambiano seicento
      // insieme, e una chiamata per cella sarebbe l'unica cosa peggiore del
      // blob di prima.
      const { error } = await Cloud.client.rpc('salva_turni', {
        p_kitchen: Cloud.kitchen.id,
        p_celle: daScrivere,
        p_da_togliere: daTogliere,
      });
      if(error) throw error;
      return true;
    },
    /* La mappa e' annidata: una copia piatta non basterebbe, perche' i secondi
       livelli resterebbero condivisi con `state` e cambierebbero sotto — e il
       confronto della volta dopo direbbe «niente e' cambiato». */
    copia(m){
      const c = {};
      for(const [id, giorni] of Object.entries(m || {})){
        c[id] = {};
        for(const [g, cella] of Object.entries(giorni || {})){
          c[id][g] = { code: cella.code, stations: { ...(cella.stations || {}) } };
        }
      }
      return c;
    },
  },

  publishedShifts: {
    async leggi(){
      const { data, error } = await Cloud.client
        .from('giorni_pubblicati').select('giorno')
        .eq('kitchen_id', Cloud.kitchen.id).order('giorno');
      if(error) throw error;
      return (data || []).map(r => r.giorno);
    },
    async scrivi(giorni){
      // Si manda l'insieme intero, ed e' quello che sono: «adesso i pubblicati
      // sono questi». Toglierne uno e aggiungerne un altro sono lo stesso
      // gesto, e sono al massimo una trentina di date.
      const { error } = await Cloud.client.rpc('salva_giorni_pubblicati', {
        p_kitchen: Cloud.kitchen.id, p_giorni: giorni || [],
      });
      if(error) throw error;
      return true;
    },
  },
};

/* L'ultima lettura, per sezione: serve a `scrivi` per sapere cos'e' cambiato.
   Sta qui e non in `state` perche' e' roba del trasporto, non dei dati. */
const ULTIMA_LETTURA = {};

async function cloudGet(key){
  const tab = SEZIONI_IN_TABELLA[key];
  if(tab){
    const letto = await tab.leggi();
    // La copia serve a confrontare il PROSSIMO salvataggio con quello che c'era
    // davvero. Senza, `ULTIMA_LETTURA` punterebbe agli stessi oggetti di
    // `state`: cambiandoli l'app cambierebbe anche il termine di paragone, e il
    // confronto direbbe sempre «niente e' cambiato».
    ULTIMA_LETTURA[key] = tab.copia ? tab.copia(letto) : (letto || []).map(r => ({ ...r }));
    return letto;
  }
  if(PERSONAL_KEYS.includes(key)){
    const { data, error } = await Cloud.client
      .from('user_data').select('value')
      .eq('user_id', Cloud.user.id).eq('key', key).maybeSingle();
    if(error) throw error;
    return data ? data.value : null;
  }
  // Si legge SEMPRE dalla funzione, mai dalla tabella: è lì dentro che i dati
  // vengono filtrati secondo il ruolo e le impostazioni della cucina. Leggendo
  // la tabella arriverebbe tutto al telefono, e nascondere poi un riquadro
  // nell'interfaccia non nasconde niente a chi apre la console del browser.
  const { data, error } = await Cloud.client.rpc('leggi_sezione', {
    p_kitchen: Cloud.kitchen.id, p_key: key,
  });
  if(error) throw error;
  if(!data) return null;
  Cloud.versions[key] = data.versione;
  return data.valore;
}

async function cloudSet(key, value){
  const tab = SEZIONI_IN_TABELLA[key];
  if(tab){
    const ok = await tab.scrivi(value, ULTIMA_LETTURA[key] ?? (tab.copia ? {} : []));
    if(ok) ULTIMA_LETTURA[key] = tab.copia ? tab.copia(value) : (value || []).map(r => ({ ...r }));
    return ok;
  }
  if(PERSONAL_KEYS.includes(key)){
    const { error } = await Cloud.client.from('user_data').upsert(
      { user_id: Cloud.user.id, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    );
    if(error) throw error;
    return true;
  }
  const { data, error } = await Cloud.client.rpc('save_kitchen_data', {
    p_kitchen: Cloud.kitchen.id, p_key: key, p_value: value,
    p_expected_version: Cloud.versions[key] ?? null
  });
  if(error){
    if((error.message||'').includes('CONFLICT')){
      // Il conflitto ha già una spiegazione sua, molto più utile di un generico
      // "non riuscito": segnalo che è stato gestito così non viene coperta.
      Cloud.lastFailure = 'conflict';
      if(Cloud.onConflict) Cloud.onConflict(key);
      return false;
    }
    throw error;
  }
  Cloud.versions[key] = data;
  return true;
}

// Interfaccia usata dall'app. Ritorna null se il dato non esiste ancora.
export const storageGet = async function(key){
  if(!CLOUD_ENABLED) return localGet(key);
  try{ return await cloudGet(key); }
  catch(e){ console.error('lettura dal cloud fallita', key, e); throw e; }
};

// Ritorna true se salvato, false se rifiutato. Quando rifiuta, Cloud.lastFailure
// dice perché ('conflict' o 'readonly'), così chi chiama non copre con un
// messaggio generico una spiegazione già data.
export const storageSet = async function(key, value){
  Cloud.lastFailure = null;
  if(!CLOUD_ENABLED) return localSet(key, value);
  if(!Cloud.canWrite()){ Cloud.lastFailure = 'readonly'; return false; }
  try{ return await cloudSet(key, value); }
  catch(e){ console.error('scrittura sul cloud fallita', key, e); return false; }
};

// --------------------------------------------------------------------------
// Più cucine dello stesso gestore.
// Chi ne gestisce diverse ha spesso persone che girano: lo stesso cuoco su due
// locali. Qui si legge cosa succede nelle ALTRE cucine per non assegnarlo in
// due posti lo stesso giorno. Non serve nessuna tabella nuova: il gestore è
// membro di tutte, quindi può già leggerne i dati.
// --------------------------------------------------------------------------
Cloud.altreCucine = function(){
  if(!CLOUD_ENABLED || !Cloud.kitchen) return [];
  return Cloud.memberships.filter(m=>m.kitchen.id !== Cloud.kitchen.id).map(m=>m.kitchen);
};

// Legge una sezione dati di un'ALTRA cucina (solo lettura, senza toccare le
// versioni della cucina corrente).
Cloud.readOtherKitchen = async function(kitchenId, key){
  // Anche qui si passa dalla funzione: chi legge un'altra cucina ci vede
  // dentro solo quello che il suo ruolo LÌ gli consente. Se in un locale sei
  // solo un cuoco, non ne leggi i fornitori nemmeno passando da qui.
  const { data, error } = await Cloud.client.rpc('leggi_sezione', {
    p_kitchen: kitchenId, p_key: key,
  });
  if(error) throw error;
  return data ? data.valore : null;
};

// Impegni della stessa persona nelle altre cucine, nell'intervallo di date.
// L'identità attraversa le cucine quando coincide l'account collegato oppure
// il numero di telefono: sono i due dati che restano gli stessi per la stessa
// persona anche in due anagrafiche compilate separatamente.
function chiaviIdentita(persona){
  const k = [];
  if(persona.userId) k.push('u:'+persona.userId);
  const tel = String(persona.phone||'').replace(/\D/g,'');
  if(tel.length >= 6) k.push('t:'+tel.slice(-9));
  return k;
}
Cloud.identityKeys = chiaviIdentita;

Cloud.impegniAltrove = async function(brigataLocale, dates){
  const occupati = {};   // staffId locale → { data: nomeCucina }
  if(!CLOUD_ENABLED || !Cloud.kitchen) return occupati;

  const indice = new Map();   // chiave identità → staffId locale
  brigataLocale.forEach(p=> chiaviIdentita(p).forEach(k=>{ if(!indice.has(k)) indice.set(k, p.id); }));
  if(!indice.size) return occupati;

  for(const cucina of Cloud.altreCucine()){
    let staffAltrove, turniAltrove;
    try{
      staffAltrove  = await Cloud.readOtherKitchen(cucina.id, 'staff');
      turniAltrove  = await Cloud.readOtherKitchen(cucina.id, 'shifts');
    }catch(e){ console.error('cucina non leggibile', cucina.name, e); continue; }
    if(!staffAltrove || !turniAltrove) continue;

    staffAltrove.forEach(p=>{
      const locale = chiaviIdentita(p).map(k=>indice.get(k)).find(Boolean);
      if(!locale) return;
      const suoiTurni = turniAltrove[p.id] || {};
      dates.forEach(d=>{
        const cell = suoiTurni[d];
        // Riposo e ferie altrove non impegnano: la persona è comunque libera.
        if(cell && cell.code && !['R','M','F',''].includes(cell.code)){
          occupati[locale] = occupati[locale] || {};
          occupati[locale][d] = cucina.name;
        }
      });
    });
  }
  return occupati;
};

// --------------------------------------------------------------------------
// Richieste del personale (ferie, riposi, servizi preferiti).
// In cloud stanno in una tabella dedicata: chi è in sola lettura deve poter
// inserire le proprie richieste senza poter toccare i dati della cucina.
// In modalità locale non ci sono account, quindi vivono nel salvataggio locale
// come qualsiasi altra sezione — le inserisce lo chef per tutti.
// --------------------------------------------------------------------------
const LOCAL_REQ_KEY = 'requests';

Cloud.listRequests = async function(){
  if(!CLOUD_ENABLED) return localGet(LOCAL_REQ_KEY) || [];
  const { data, error } = await Cloud.client
    .from('kitchen_requests')
    .select('id, staff_id, user_id, dal, al, tipo, servizi, stato, nota, created_at')
    .eq('kitchen_id', Cloud.kitchen.id)
    .order('dal', { ascending: true });
  if(error) throw error;
  return data || [];
};

Cloud.createRequest = async function(req){
  if(!CLOUD_ENABLED){
    const list = localGet(LOCAL_REQ_KEY) || [];
    list.push({ ...req, id: 'r'+Date.now().toString(36), stato: req.stato || 'in_attesa' });
    localSet(LOCAL_REQ_KEY, list);
    return;
  }
  const { data, error } = await Cloud.client.from('kitchen_requests').insert({
    kitchen_id: Cloud.kitchen.id,
    staff_id: req.staff_id, user_id: Cloud.user.id,
    dal: req.dal, al: req.al, tipo: req.tipo,
    servizi: req.servizi || [], nota: req.nota || null,
    // Quando è il titolare a registrare una richiesta ricevuta a voce, non ha
    // senso che debba poi approvare sé stesso.
    stato: Cloud.puoDecidereRichieste() ? 'approvata' : 'in_attesa',
  }).select('id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non hai i permessi per inserire questa richiesta.');
};

Cloud.decideRequest = async function(id, stato){
  if(!CLOUD_ENABLED){
    const list = localGet(LOCAL_REQ_KEY) || [];
    const r = list.find(x=>x.id===id); if(r) r.stato = stato;
    localSet(LOCAL_REQ_KEY, list);
    return;
  }
  const { data, error } = await Cloud.client.from('kitchen_requests')
    .update({ stato, decisa_da: Cloud.user.id, decisa_il: new Date().toISOString() })
    .eq('id', id).select('id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Solo chi gestisce la cucina può decidere sulle richieste.');
};

Cloud.deleteRequest = async function(id){
  if(!CLOUD_ENABLED){
    localSet(LOCAL_REQ_KEY, (localGet(LOCAL_REQ_KEY)||[]).filter(x=>x.id!==id));
    return;
  }
  const { data, error } = await Cloud.client.from('kitchen_requests')
    .delete().eq('id', id).select('id');
  if(error) throw error;
  if(!data || !data.length) throw new Error('Non puoi ritirare questa richiesta.');
};

// --------------------------------------------------------------------------
// Chiamate AI — passano sempre dal proxy server, che è l'unico a conoscere la
// chiave API. In modalità locale non c'è nessun server: le funzioni AI restano
// spente e l'app lo dice chiaramente invece di fallire in silenzio.
// --------------------------------------------------------------------------
Cloud.aiAvailable = function(){ return CLOUD_ENABLED && !!Cloud.kitchen; };

// Errori con userFacing = true sono scritti per essere mostrati così come sono.
function aiError(msg){ const e = new Error(msg); e.userFacing = true; return e; }

Cloud.ai = async function(body){
  if(!Cloud.aiAvailable()){
    throw aiError('Le funzioni AI sono disponibili solo con un account e una cucina attiva.');
  }
  const { data } = await Cloud.client.auth.getSession();
  if(!data.session) throw aiError('Sessione scaduta: rientra con le tue credenziali.');

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + data.session.access_token,
      'X-Kitchen-Id': Cloud.kitchen.id,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(()=>({}));
  if(!res.ok){
    throw aiError(json.error || ('Il servizio AI ha risposto con un errore (' + res.status + ').'));
  }
  return json;
};

export { Cloud };
