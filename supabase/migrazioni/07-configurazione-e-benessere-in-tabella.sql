-- ============================================================================
-- LA SESTA FETTA, E L'ULTIMA DELLE SEZIONI: la configurazione dei turni,
-- le ore registrate, e le impostazioni della cucina.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
--
-- Sono tutte piccole e nessuna ha niente da nascondere a chi la può già
-- leggere: partite, servizi e tipi di turno servono a chiunque guardi un
-- prospetto, e senza non si capisce cosa vuol dire «SP».
--
-- Restano fuori `knowledge` e `chatHistory`, ed è deciso: non sono collezioni
-- di entità, sono un testo e una conversazione. Si leggono e si riscrivono
-- interi, e spezzarli non darebbe niente.
-- ============================================================================


-- ---- Le partite di cucina --------------------------------------------------
create table if not exists public.partite (
  kitchen_id  uuid not null references public.kitchens(id) on delete cascade,
  id          text not null,
  name        text not null,
  -- Chi lavora QUI copre anche quelle: le insalate che danno una mano al
  -- lavaggio. Resta JSON — è una manciata di id dentro la partita.
  copre_anche jsonb not null default '[]'::jsonb,
  -- L'ORDINE È IL DATO: le partite si spostano su e giù con le frecce, e
  -- quell'ordine è quello che il titolare vede e su cui ragiona.
  posizione   integer not null default 0,
  primary key (kitchen_id, id)
);

-- ---- I servizi della giornata ----------------------------------------------
create table if not exists public.servizi (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  name       text not null,
  posizione  integer not null default 0,
  primary key (kitchen_id, id)
);

-- ---- I tipi di turno -------------------------------------------------------
create table if not exists public.tipi_turno (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  -- La SIGLA che compare nella griglia: P, SP, R. È un dato della cucina, non
  -- una chiave: si può cambiare, e cambiarla non deve rompere i riferimenti.
  code       text not null,
  label      text,
  hours      numeric not null default 0,
  services   jsonb not null default '[]'::jsonb,
  posizione  integer not null default 0,
  primary key (kitchen_id, id)
);

-- ---- Il fabbisogno ---------------------------------------------------------
-- Quante persone servono, per servizio e per partita. Qui la riga È il dato —
-- «due al lavaggio a cena» — e finalmente si può contare senza disfare un JSON.
create table if not exists public.fabbisogno (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  servizio   text not null,
  stazione   text not null,
  quante     integer not null default 0 check (quante >= 0),
  primary key (kitchen_id, servizio, stazione)
);

-- ---- Le ore registrate -----------------------------------------------------
-- Le ore EFFETTIVE, quelle che qualcuno ha fatto davvero. Sono un dato da
-- datore di lavoro come le ore di contratto, ma servono anche a chi guarda il
-- benessere della brigata: restano visibili a chi può modificare.
create table if not exists public.ore_registrate (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  staff_id   text not null,
  giorno     date not null,
  ore        numeric not null default 0 check (ore >= 0),
  primary key (kitchen_id, id)
);

-- ---- Le impostazioni della cucina ------------------------------------------
-- Una riga per cucina, non una collezione. La valuta, e dove finiscono le ore
-- che il fabbisogno non chiede.
create table if not exists public.impostazioni_cucina (
  kitchen_id     uuid primary key references public.kitchens(id) on delete cascade,
  valuta         text not null default 'EUR',
  eccedenza_modo text not null default 'auto',
  eccedenza_giorni jsonb not null default '[]'::jsonb
);

alter table public.partite             enable row level security;
alter table public.servizi             enable row level security;
alter table public.tipi_turno          enable row level security;
alter table public.fabbisogno          enable row level security;
alter table public.ore_registrate      enable row level security;
alter table public.impostazioni_cucina enable row level security;

-- Tutte con la stessa regola: le legge ogni membro, le scrive chi può
-- modificare. Le ore registrate sono l'eccezione: le legge chi può modificare,
-- perché sono ore di lavoro di una persona e non servono a leggere un turno.
do $$
declare t text;
begin
  foreach t in array array['partite', 'servizi', 'tipi_turno', 'fabbisogno', 'impostazioni_cucina'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.my_role(kitchen_id) is not null)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.can_write(kitchen_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using (public.can_write(kitchen_id)) with check (public.can_write(kitchen_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using (public.can_write(kitchen_id))', t || '_delete', t);
  end loop;
end $$;

drop policy if exists ore_select on public.ore_registrate;
create policy ore_select on public.ore_registrate
  for select using (public.can_write(kitchen_id));
drop policy if exists ore_insert on public.ore_registrate;
create policy ore_insert on public.ore_registrate
  for insert with check (public.can_write(kitchen_id));
drop policy if exists ore_update on public.ore_registrate;
create policy ore_update on public.ore_registrate
  for update using (public.can_write(kitchen_id)) with check (public.can_write(kitchen_id));
drop policy if exists ore_delete on public.ore_registrate;
create policy ore_delete on public.ore_registrate
  for delete using (public.can_write(kitchen_id));


-- ---- Leggere e salvare -----------------------------------------------------
-- L'ordine si conserva con `posizione`, e si riassegna a ogni salvataggio
-- seguendo l'ordine in cui arrivano le righe: è così che l'app lo tratta già —
-- si sposta una partita su, e l'elenco intero cambia ordine.

create or replace function public.leggi_partite(p_kitchen uuid)
returns table (id text, name text, "copreAnche" jsonb)
language sql security invoker stable set search_path = public as $$
  select id, name, copre_anche from public.partite
   where kitchen_id = p_kitchen order by posizione, lower(name);
$$;
grant execute on function public.leggi_partite(uuid) to authenticated;

create or replace function public.salva_partite(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; i integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.partite as p (kitchen_id, id, name, copre_anche, posizione)
    values (p_kitchen, r->>'id', coalesce(r->>'name',''),
            coalesce(r->'copreAnche','[]'::jsonb), i)
    on conflict (kitchen_id, id) do update
      set name = excluded.name, copre_anche = excluded.copre_anche,
          posizione = excluded.posizione;
    i := i + 1;
  end loop;
  return i;
end; $$;
grant execute on function public.salva_partite(uuid, jsonb) to authenticated;

create or replace function public.leggi_servizi(p_kitchen uuid)
returns table (id text, name text)
language sql security invoker stable set search_path = public as $$
  select id, name from public.servizi where kitchen_id = p_kitchen order by posizione;
$$;
grant execute on function public.leggi_servizi(uuid) to authenticated;

create or replace function public.salva_servizi(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; i integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.servizi as s (kitchen_id, id, name, posizione)
    values (p_kitchen, r->>'id', coalesce(r->>'name',''), i)
    on conflict (kitchen_id, id) do update
      set name = excluded.name, posizione = excluded.posizione;
    i := i + 1;
  end loop;
  return i;
end; $$;
grant execute on function public.salva_servizi(uuid, jsonb) to authenticated;

create or replace function public.leggi_tipi_turno(p_kitchen uuid)
returns table (id text, code text, label text, hours numeric, services jsonb)
language sql security invoker stable set search_path = public as $$
  select id, code, label, hours, services from public.tipi_turno
   where kitchen_id = p_kitchen order by posizione;
$$;
grant execute on function public.leggi_tipi_turno(uuid) to authenticated;

create or replace function public.salva_tipi_turno(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; i integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.tipi_turno as t (kitchen_id, id, code, label, hours, services, posizione)
    values (p_kitchen, r->>'id', coalesce(r->>'code',''), nullif(r->>'label',''),
            coalesce(nullif(r->>'hours','')::numeric, 0),
            coalesce(r->'services','[]'::jsonb), i)
    on conflict (kitchen_id, id) do update
      set code = excluded.code, label = excluded.label, hours = excluded.hours,
          services = excluded.services, posizione = excluded.posizione;
    i := i + 1;
  end loop;
  return i;
end; $$;
grant execute on function public.salva_tipi_turno(uuid, jsonb) to authenticated;

-- Il fabbisogno arriva come {servizio: [{stationId, count}]} e si rimanda
-- com'è: si riscrive tutto perché sono al massimo qualche decina di righe, e
-- una riga a zero non è «zero persone», è «questa riga non c'è».
create or replace function public.leggi_fabbisogno(p_kitchen uuid)
returns jsonb
language sql security invoker stable set search_path = public as $$
  select coalesce(jsonb_object_agg(servizio, righe), '{}'::jsonb) from (
    select servizio, jsonb_agg(jsonb_build_object('stationId', stazione, 'count', quante)) as righe
      from public.fabbisogno where kitchen_id = p_kitchen group by servizio
  ) x;
$$;
grant execute on function public.leggi_fabbisogno(uuid) to authenticated;

create or replace function public.salva_fabbisogno(p_kitchen uuid, p_dati jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare sv text; r jsonb; n integer := 0;
begin
  delete from public.fabbisogno where kitchen_id = p_kitchen;
  for sv in select jsonb_object_keys(coalesce(p_dati,'{}'::jsonb)) loop
    for r in select * from jsonb_array_elements(p_dati->sv) loop
      if coalesce((r->>'count')::integer, 0) > 0 then
        insert into public.fabbisogno (kitchen_id, servizio, stazione, quante)
        values (p_kitchen, sv, r->>'stationId', (r->>'count')::integer)
        on conflict (kitchen_id, servizio, stazione) do update set quante = excluded.quante;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_fabbisogno(uuid, jsonb) to authenticated;

create or replace function public.leggi_ore_registrate(p_kitchen uuid)
returns table (id text, "staffId" text, date date, ore numeric)
language sql security invoker stable set search_path = public as $$
  select id, staff_id, giorno, ore from public.ore_registrate
   where kitchen_id = p_kitchen order by giorno;
$$;
grant execute on function public.leggi_ore_registrate(uuid) to authenticated;

create or replace function public.salva_ore_registrate(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.ore_registrate as o (kitchen_id, id, staff_id, giorno, ore)
    values (p_kitchen, r->>'id', r->>'staffId', (r->>'date')::date,
            coalesce(nullif(r->>'ore','')::numeric, 0))
    on conflict (kitchen_id, id) do update
      set staff_id = excluded.staff_id, giorno = excluded.giorno, ore = excluded.ore;
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_ore_registrate(uuid, jsonb) to authenticated;

create or replace function public.leggi_impostazioni(p_kitchen uuid)
returns jsonb
language sql security invoker stable set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('valuta', valuta) from public.impostazioni_cucina
      where kitchen_id = p_kitchen),
    jsonb_build_object('valuta', 'EUR'));
$$;
grant execute on function public.leggi_impostazioni(uuid) to authenticated;

create or replace function public.salva_impostazioni(p_kitchen uuid, p_dati jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.impostazioni_cucina as i (kitchen_id, valuta)
  values (p_kitchen, coalesce(nullif(p_dati->>'valuta',''), 'EUR'))
  on conflict (kitchen_id) do update set valuta = excluded.valuta;
end; $$;
grant execute on function public.salva_impostazioni(uuid, jsonb) to authenticated;

create or replace function public.leggi_eccedenza(p_kitchen uuid)
returns jsonb
language sql security invoker stable set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('modo', eccedenza_modo, 'giorni', eccedenza_giorni)
       from public.impostazioni_cucina where kitchen_id = p_kitchen),
    jsonb_build_object('modo', 'auto', 'giorni', '[]'::jsonb));
$$;
grant execute on function public.leggi_eccedenza(uuid) to authenticated;

create or replace function public.salva_eccedenza(p_kitchen uuid, p_dati jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.impostazioni_cucina as i (kitchen_id, eccedenza_modo, eccedenza_giorni)
  values (p_kitchen, coalesce(nullif(p_dati->>'modo',''), 'auto'),
          coalesce(p_dati->'giorni', '[]'::jsonb))
  on conflict (kitchen_id) do update
    set eccedenza_modo = excluded.eccedenza_modo,
        eccedenza_giorni = excluded.eccedenza_giorni;
end; $$;
grant execute on function public.salva_eccedenza(uuid, jsonb) to authenticated;


-- ============================================================================
-- CONTROLLO
--   select * from public.leggi_partite('<id cucina>');
--   select public.leggi_fabbisogno('<id cucina>');
-- ============================================================================
