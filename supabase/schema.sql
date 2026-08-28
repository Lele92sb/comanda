-- ============================================================================
-- Comanda — schema del database (Supabase / Postgres)
--
-- Da eseguire UNA VOLTA nel SQL Editor del progetto Supabase.
-- È riscrivibile: usa "if not exists" / "drop policy if exists", quindi rieseguirlo
-- non distrugge i dati già presenti.
--
-- Modello: una CUCINA (kitchens) è il contenitore di tutti i dati. Le persone
-- (kitchen_members) appartengono a una cucina con un ruolo:
--   owner  = il titolare: come editor, ma può anche invitare/rimuovere persone
--   editor = può leggere e modificare i dati della cucina
--   viewer = può SOLO leggere
-- Il permesso è applicato da Postgres (Row Level Security), non dall'interfaccia:
-- anche chiamando l'API a mano, un viewer non riesce a scrivere.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabelle
-- ----------------------------------------------------------------------------

create table if not exists public.kitchens (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- Stato commerciale, volutamente slegato dal metodo di vendita (abbonamento o
  -- una tantum): l'app blocca l'accesso quando è 'suspended'. Quando ci sarà un
  -- sistema di pagamento, sarà quello a scrivere qui.
  status        text not null default 'trial' check (status in ('trial','active','suspended')),
  trial_ends_at timestamptz not null default (now() + interval '60 days'),
  -- Tetto di sicurezza sui costi AI, per cucina e per mese.
  ai_month      text not null default to_char(now(),'YYYY-MM'),
  ai_calls      integer not null default 0,
  ai_limit      integer not null default 1000,
  created_at    timestamptz not null default now(),
  created_by    uuid not null references auth.users(id)
);

create table if not exists public.kitchen_members (
  kitchen_id   uuid not null references public.kitchens(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','editor','viewer')),
  display_name text,
  -- Copia dell'email al momento dell'ingresso. Serve perché la tabella degli
  -- account (auth.users) non è leggibile dal browser: senza questa colonna il
  -- titolare vedrebbe righe anonime e non saprebbe a chi sta cambiando il
  -- permesso o chi sta rimuovendo.
  email        text,
  created_at   timestamptz not null default now(),
  primary key (kitchen_id, user_id)
);

-- Adeguamento per i database creati prima che l'email venisse memorizzata.
-- Rieseguibile senza effetti.
alter table public.kitchen_members add column if not exists email text;
update public.kitchen_members m
set email = u.email
from auth.users u
where u.id = m.user_id and m.email is null;

-- Dati della cucina, condivisi da tutti i membri. Una riga per "sezione"
-- (ingredients, recipes, shifts, ...): l'app lavora già a sezioni intere, quindi
-- questo mantiene il codice applicativo invariato. `version` serve a non far
-- sovrascrivere silenziosamente il lavoro di un collega (vedi save_kitchen_data).
create table if not exists public.kitchen_data (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (kitchen_id, key)
);

-- Dati personali del singolo utente, non condivisi con la cucina
-- (oggi: la conversazione con l'assistente AI, che è personale).
create table if not exists public.user_data (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Richieste del personale: ferie, giorni di riposo, servizi preferiti.
-- Tabella a sé e non una sezione di kitchen_data perché chi è in sola lettura
-- deve poter INSERIRE le proprie richieste senza poter toccare nient'altro
-- della cucina: un permesso che sul blob dei dati non è esprimibile.
create table if not exists public.kitchen_requests (
  id         uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  staff_id   text not null,               -- id della persona nella brigata
  user_id    uuid references auth.users(id) on delete set null,  -- chi l'ha inserita
  dal        date not null,
  al         date not null,
  tipo       text not null check (tipo in ('ferie','riposo','servizio')),
  servizi    jsonb not null default '[]'::jsonb,
  stato      text not null default 'in_attesa' check (stato in ('in_attesa','approvata','rifiutata')),
  nota       text,
  created_at timestamptz not null default now(),
  decisa_da  uuid references auth.users(id),
  decisa_il  timestamptz,
  check (al >= dal)
);
create index if not exists kitchen_requests_kitchen_idx on public.kitchen_requests(kitchen_id, stato);

create table if not exists public.kitchen_invites (
  code       text primary key,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  role       text not null check (role in ('editor','viewer')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Durata decisa da chi invita, modificabile in seguito.
  -- NULL = nessuna scadenza (il codice resta valido finché non viene usato o annullato).
  expires_at timestamptz,
  used_by    uuid references auth.users(id),
  used_at    timestamptz
);

-- Adeguamento per i database creati prima che la scadenza fosse configurabile
-- (allora era obbligatoria e fissa a 14 giorni). Rieseguibile senza effetti.
alter table public.kitchen_invites alter column expires_at drop not null;
alter table public.kitchen_invites alter column expires_at drop default;

-- ----------------------------------------------------------------------------
-- Ruolo dell'utente corrente in una cucina.
-- security definer: le policy su kitchen_members devono poter interrogare
-- kitchen_members senza richiamare ricorsivamente sé stesse.
-- ----------------------------------------------------------------------------
create or replace function public.my_role(p_kitchen uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.kitchen_members
  where kitchen_id = p_kitchen and user_id = auth.uid();
$$;

create or replace function public.can_write(p_kitchen uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.my_role(p_kitchen) in ('owner','editor'), false);
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.kitchens        enable row level security;
alter table public.kitchen_members enable row level security;
alter table public.kitchen_data    enable row level security;
alter table public.user_data       enable row level security;
alter table public.kitchen_invites enable row level security;

drop policy if exists kitchens_select on public.kitchens;
create policy kitchens_select on public.kitchens
  for select using (public.my_role(id) is not null);

-- Solo il titolare può toccare la propria cucina...
drop policy if exists kitchens_update on public.kitchens;
create policy kitchens_update on public.kitchens
  for update using (public.my_role(id) = 'owner')
  with check (public.my_role(id) = 'owner');

-- ...ma solo per rinominarla. Le policy RLS decidono QUALI RIGHE si possono
-- toccare, non quali colonne: senza questo, un titolare potrebbe mettersi da
-- solo status = 'active' o alzarsi il tetto di chiamate AI. I permessi di
-- colonna chiudono la porta; status, trial_ends_at e ai_limit restano
-- scrivibili solo lato server (service role).
revoke update on public.kitchens from authenticated;
grant update (name) on public.kitchens to authenticated;

-- Chi lavora in cucina vede SOLO la propria riga; l'elenco completo della
-- squadra — con le email dei colleghi — è riservato al titolare.
-- Nascondere il pulsante nell'interfaccia non basterebbe: senza questa policy
-- chiunque potrebbe leggere le email dei colleghi interrogando l'API a mano.
drop policy if exists members_select on public.kitchen_members;
create policy members_select on public.kitchen_members
  for select using (
    user_id = auth.uid() or public.my_role(kitchen_id) = 'owner'
  );

drop policy if exists members_write on public.kitchen_members;
create policy members_write on public.kitchen_members
  for all using (public.my_role(kitchen_id) = 'owner')
  with check (public.my_role(kitchen_id) = 'owner');

drop policy if exists data_select on public.kitchen_data;
create policy data_select on public.kitchen_data
  for select using (public.my_role(kitchen_id) is not null);

drop policy if exists data_write on public.kitchen_data;
create policy data_write on public.kitchen_data
  for all using (public.can_write(kitchen_id))
  with check (public.can_write(kitchen_id));

drop policy if exists user_data_all on public.user_data;
create policy user_data_all on public.user_data
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Richieste: ognuno vede e crea le proprie; il titolare le vede tutte e decide.
alter table public.kitchen_requests enable row level security;

drop policy if exists requests_select on public.kitchen_requests;
create policy requests_select on public.kitchen_requests
  for select using (
    user_id = auth.uid() or public.my_role(kitchen_id) = 'owner'
  );

-- La persona della brigata collegata a chi sta usando l'app. Il collegamento
-- vive dentro i dati della cucina (staff[].userId), non leggibili sotto RLS da
-- una policy: da qui il security definer.
create or replace function public.my_staff_id(p_kitchen uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select s->>'id'
  from public.kitchen_data d,
       lateral jsonb_array_elements(d.value) s
  where d.kitchen_id = p_kitchen and d.key = 'staff'
    and s->>'userId' = auth.uid()::text
  limit 1;
$$;
grant execute on function public.my_staff_id(uuid) to authenticated;

-- Si può inserire una richiesta SOLO PER SÉ STESSI. Senza il controllo sul
-- staff_id, un dipendente poteva inserire richieste a nome di un collega: gli
-- bastava scriverne l'identificativo. Restavano in attesa, ma un titolare
-- distratto avrebbe potuto mandare in ferie qualcuno che non le aveva chieste.
-- Il titolare resta libero di registrarle per chiunque, anche per chi non ha
-- un account.
drop policy if exists requests_insert on public.kitchen_requests;
create policy requests_insert on public.kitchen_requests
  for insert with check (
    public.my_role(kitchen_id) = 'owner'
    or (user_id = auth.uid() and staff_id = public.my_staff_id(kitchen_id))
  );

-- Approvare o rifiutare è solo del titolare: altrimenti chiunque potrebbe
-- auto-approvarsi le ferie e vincolare il generatore.
drop policy if exists requests_update on public.kitchen_requests;
create policy requests_update on public.kitchen_requests
  for update using (public.my_role(kitchen_id) = 'owner')
  with check (public.my_role(kitchen_id) = 'owner');

-- Ritirare una richiesta: il titolare sempre, l'interessato finché è in attesa.
drop policy if exists requests_delete on public.kitchen_requests;
create policy requests_delete on public.kitchen_requests
  for delete using (
    public.my_role(kitchen_id) = 'owner'
    or (user_id = auth.uid() and stato = 'in_attesa')
  );

-- Gli inviti si leggono/creano solo dal titolare della cucina. Chi accetta un
-- invito non è ancora membro e quindi non può leggerli: usa join_kitchen().
drop policy if exists invites_owner on public.kitchen_invites;
create policy invites_owner on public.kitchen_invites
  for all using (public.my_role(kitchen_id) = 'owner')
  with check (public.my_role(kitchen_id) = 'owner');

-- ----------------------------------------------------------------------------
-- Creazione cucina: cucina + membership da titolare, in un'unica transazione.
-- security definer perché al momento dell'insert l'utente non è ancora membro.
-- ----------------------------------------------------------------------------
create or replace function public.create_kitchen(p_name text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Serve un nome per la cucina'; end if;

  insert into public.kitchens (name, created_by) values (trim(p_name), auth.uid())
  returning id into v_id;

  insert into public.kitchen_members (kitchen_id, user_id, role, display_name, email)
  values (v_id, auth.uid(), 'owner', nullif(trim(coalesce(p_display_name,'')),''),
          (select email from auth.users where id = auth.uid()));

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ingresso in una cucina tramite codice d'invito.
-- ----------------------------------------------------------------------------
create or replace function public.join_kitchen(p_code text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare inv public.kitchen_invites;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;

  select * into inv from public.kitchen_invites
  where code = upper(trim(p_code)) for update;

  if inv is null then raise exception 'Codice invito non valido'; end if;
  if inv.used_by is not null then raise exception 'Codice invito già utilizzato'; end if;
  -- expires_at NULL significa "senza scadenza": nessun controllo da fare.
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Codice invito scaduto';
  end if;

  insert into public.kitchen_members (kitchen_id, user_id, role, display_name, email)
  values (inv.kitchen_id, auth.uid(), inv.role, nullif(trim(coalesce(p_display_name,'')),''),
          (select email from auth.users where id = auth.uid()))
  on conflict (kitchen_id, user_id) do nothing;

  update public.kitchen_invites
  set used_by = auth.uid(), used_at = now()
  where code = inv.code;

  return inv.kitchen_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Il proprio nome in cucina ("Marco, secondo").
-- Passa da una funzione dedicata invece che da un update diretto: concedere a
-- ciascuno la modifica della propria riga aprirebbe la porta a cambiarsi anche
-- il ruolo. Qui si tocca solo display_name, e solo la propria riga.
-- ----------------------------------------------------------------------------
create or replace function public.set_my_display_name(p_kitchen uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  update public.kitchen_members
  set display_name = nullif(trim(coalesce(p_name,'')),'')
  where kitchen_id = p_kitchen and user_id = auth.uid();
  if not found then raise exception 'Non fai parte di questa cucina'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Salvataggio di una sezione dati, con controllo di concorrenza.
-- security invoker (default): le policy RLS restano in vigore, quindi un viewer
-- che chiamasse questa funzione otterrebbe comunque un errore di permessi.
-- Se qualcun altro ha salvato la stessa sezione nel frattempo, solleva
-- 'CONFLICT' invece di sovrascrivere il suo lavoro.
-- ----------------------------------------------------------------------------
create or replace function public.save_kitchen_data(
  p_kitchen uuid, p_key text, p_value jsonb, p_expected_version bigint
)
returns bigint
language plpgsql
set search_path = public
as $$
declare v_current bigint;
begin
  -- Controllo esplicito, prima di toccare qualsiasi cosa. Senza di questo un
  -- viewer non farebbe danni (l'RLS filtra comunque le righe), ma la UPDATE
  -- non troverebbe nessuna riga da aggiornare e Postgres NON lo considera un
  -- errore: la funzione risponderebbe "salvato" a un salvataggio mai avvenuto,
  -- e chi scrive perderebbe il lavoro credendolo al sicuro.
  if not public.can_write(p_kitchen) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select version into v_current from public.kitchen_data
  where kitchen_id = p_kitchen and key = p_key;

  if v_current is null then
    insert into public.kitchen_data (kitchen_id, key, value, version, updated_by)
    values (p_kitchen, p_key, p_value, 1, auth.uid());
    return 1;
  end if;

  if p_expected_version is not null and p_expected_version <> v_current then
    raise exception 'CONFLICT' using errcode = 'P0001';
  end if;

  update public.kitchen_data
  set value = p_value, version = v_current + 1, updated_at = now(), updated_by = auth.uid()
  where kitchen_id = p_kitchen and key = p_key;

  -- Rete di sicurezza: se per qualsiasi motivo la riga non è stata aggiornata,
  -- meglio un errore che un falso "salvato".
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return v_current + 1;
end;
$$;

-- ----------------------------------------------------------------------------
-- Consumo AI: incrementa il contatore mensile della cucina e dice se la
-- chiamata è consentita. Chiamata SOLO dal proxy server (service role).
-- ----------------------------------------------------------------------------
create or replace function public.consume_ai_call(p_kitchen uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare k public.kitchens; v_month text := to_char(now(),'YYYY-MM');
begin
  select * into k from public.kitchens where id = p_kitchen for update;
  if k is null then return jsonb_build_object('allowed', false, 'reason','kitchen_not_found'); end if;

  if k.status = 'suspended' then
    return jsonb_build_object('allowed', false, 'reason','suspended');
  end if;
  if k.status = 'trial' and k.trial_ends_at < now() then
    return jsonb_build_object('allowed', false, 'reason','trial_expired');
  end if;

  if k.ai_month <> v_month then
    update public.kitchens set ai_month = v_month, ai_calls = 1 where id = p_kitchen;
    return jsonb_build_object('allowed', true, 'used', 1, 'limit', k.ai_limit);
  end if;

  if k.ai_calls >= k.ai_limit then
    return jsonb_build_object('allowed', false, 'reason','quota_exceeded', 'limit', k.ai_limit);
  end if;

  update public.kitchens set ai_calls = k.ai_calls + 1 where id = p_kitchen;
  return jsonb_build_object('allowed', true, 'used', k.ai_calls + 1, 'limit', k.ai_limit);
end;
$$;

-- ----------------------------------------------------------------------------
-- Permessi di esecuzione
-- ----------------------------------------------------------------------------
-- consume_ai_call decide se una chiamata AI è consentita e la conteggia: deve
-- poterla invocare solo il proxy server, mai il browser.
revoke all on function public.consume_ai_call(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid)                     to service_role;
grant execute on function public.create_kitchen(text, text)                to authenticated;
grant execute on function public.join_kitchen(text, text)                  to authenticated;
grant execute on function public.set_my_display_name(uuid, text)           to authenticated;
grant execute on function public.save_kitchen_data(uuid, text, jsonb, bigint) to authenticated;
grant execute on function public.my_role(uuid)                             to authenticated;
grant execute on function public.can_write(uuid)                           to authenticated;
