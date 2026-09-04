-- ============================================================================
-- LA SECONDA FETTA: la brigata.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
-- Il piano sta in supabase/PIANO-modello-dati.md.
--
-- È la redazione più delicata dell'app, e le due tabelle fanno sparire da sole
-- un difetto che c'è oggi.
--
-- OGGI `reddigi_sezione` NON TOGLIE DEI CAMPI: RICOSTRUISCE la persona su una
-- lista chiusa, e lo dice il commento nello schema — «un vincolo nuovo che non
-- si aggiunge qui arriva undefined a chi può modificare, il default lo legge
-- come acceso, e lo stesso generatore dà due prospetti diversi a seconda di
-- chi preme il bottone». È una lista da ricordarsi di aggiornare, e le liste da
-- ricordarsi prima o poi non si ricordano.
--
-- Con due tabelle non c'è nessuna lista: i vincoli stanno TUTTI nella prima,
-- e un campo nuovo ci finisce dentro senza che nessuno debba decidere niente.
-- ============================================================================


-- ---- 1. Quello che serve per FARE I TURNI ---------------------------------
-- Nome, ruolo in cucina, partite che sa fare, quote settimanali, se può fare
-- extra. Sono VINCOLI DI PIANIFICAZIONE: chiunque guardi un prospetto deve
-- poterli vedere, o il prospetto non si capisce.
create table if not exists public.persone (
  kitchen_id     uuid not null references public.kitchens(id) on delete cascade,
  id             text not null,
  name           text not null,
  -- Il ruolo IN CUCINA (capopartita, commis...), da non confondere col
  -- permesso sull'app, che sta in `kitchen_members.role`. Due cose diverse
  -- con lo stesso nome sono un tranello: qui è `ruolo_cucina`.
  ruolo_cucina   text,
  -- Le partite e le quote restano JSON, ed è una scelta: sono liste corte che
  -- vivono DENTRO la persona, non entità con una vita propria. Spezzarle in
  -- altre due tabelle darebbe due join in più per leggere una brigata di
  -- venti, e non risolverebbe niente che oggi faccia male.
  stations       jsonb not null default '[]'::jsonb,
  weekly_quota   jsonb not null default '[]'::jsonb,
  puo_fare_extra boolean not null default true,
  aggiornato_il  timestamptz not null default now(),
  primary key (kitchen_id, id)
);

-- ---- 2. Quello che è DA DATORE DI LAVORO ----------------------------------
-- Telefono, email, ore di contratto. E il collegamento all'account.
--
-- `user_id` STA QUI, ed è la decisione meno ovvia di questa fetta: non è un
-- dato di contatto, è un'identità. Nella tabella pubblica direbbe a ogni
-- membro quale account corrisponde a quale persona della brigata, che è
-- esattamente il genere di correlazione che non serve a nessuno per fare i
-- turni. `my_staff_id()` lo legge lo stesso perché è security definer.
create table if not exists public.persone_personali (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  phone      text,
  email      text,
  -- Le ore di CONTRATTO. Sono un dato da busta paga, non un vincolo di
  -- pianificazione: il generatore lavora sulle quote, non su queste.
  hours      numeric check (hours is null or hours >= 0),
  user_id    uuid references auth.users(id) on delete set null,
  primary key (kitchen_id, id),
  foreign key (kitchen_id, id) references public.persone(kitchen_id, id) on delete cascade
);

create index if not exists persone_per_cucina on public.persone(kitchen_id);

alter table public.persone            enable row level security;
alter table public.persone_personali  enable row level security;


-- ---- 3. Chi vede cosa ------------------------------------------------------

create or replace function public.vede_personali(p_kitchen uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case public.my_role(p_kitchen)
    when 'owner'  then true
    when 'editor' then coalesce((select editor_vede_personali from public.kitchens where id = p_kitchen), false)
    else false
  end;
$$;
grant execute on function public.vede_personali(uuid) to authenticated;

drop policy if exists persone_select on public.persone;
create policy persone_select on public.persone
  for select using (public.my_role(kitchen_id) is not null);

drop policy if exists persone_insert on public.persone;
create policy persone_insert on public.persone
  for insert with check (public.can_write(kitchen_id));

drop policy if exists persone_update on public.persone;
create policy persone_update on public.persone
  for update using (public.can_write(kitchen_id)) with check (public.can_write(kitchen_id));

drop policy if exists persone_delete on public.persone;
create policy persone_delete on public.persone
  for delete using (public.can_write(kitchen_id));

-- I personali: solo chi li vede. E «non si scrive ciò che non si può leggere».
drop policy if exists personali_select on public.persone_personali;
create policy personali_select on public.persone_personali
  for select using (public.vede_personali(kitchen_id));

drop policy if exists personali_insert on public.persone_personali;
create policy personali_insert on public.persone_personali
  for insert with check (public.can_write(kitchen_id) and public.vede_personali(kitchen_id));

drop policy if exists personali_update on public.persone_personali;
create policy personali_update on public.persone_personali
  for update using (public.can_write(kitchen_id) and public.vede_personali(kitchen_id))
  with check (public.can_write(kitchen_id) and public.vede_personali(kitchen_id));

drop policy if exists personali_delete on public.persone_personali;
create policy personali_delete on public.persone_personali
  for delete using (public.can_write(kitchen_id) and public.vede_personali(kitchen_id));


-- ---- 4. `my_staff_id` cambia casa -----------------------------------------
-- Leggeva `kitchen_data` alla chiave 'staff'. Quel blob non è più la verità.
-- Resta security definer: serve a sapere chi sei, e quindi deve funzionare
-- anche per chi non può leggere `persone_personali` — cioè proprio per la
-- persona che sta chiedendo di sé stessa.
create or replace function public.my_staff_id(p_kitchen uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select id from public.persone_personali
   where kitchen_id = p_kitchen and user_id = auth.uid()
   limit 1;
$$;


-- ---- 5. Leggere e salvare --------------------------------------------------
-- Nella forma che l'app usa già: `name`, `weeklyQuota`, `puoFareExtra`. Chi non
-- vede i personali riceve le stesse righe con telefono, email, ore e account
-- vuoti — non per finta: la join non trova niente, perché la policy non gliela
-- fa vedere.
create or replace function public.leggi_persone(p_kitchen uuid)
returns table (
  id text, name text, role text, stations jsonb, "weeklyQuota" jsonb,
  "puoFareExtra" boolean, phone text, email text, hours numeric, "userId" uuid
)
language sql
security invoker
stable
set search_path = public
as $$
  select p.id, p.name, p.ruolo_cucina, p.stations, p.weekly_quota, p.puo_fare_extra,
         d.phone, d.email, d.hours, d.user_id
    from public.persone p
    left join public.persone_personali d
      on d.kitchen_id = p.kitchen_id and d.id = p.id
   where p.kitchen_id = p_kitchen
   order by lower(p.name);
$$;
grant execute on function public.leggi_persone(uuid) to authenticated;

create or replace function public.salva_persone(p_kitchen uuid, p_righe jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r         jsonb;
  n         integer := 0;
  personali boolean := public.vede_personali(p_kitchen);
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    insert into public.persone as p
      (kitchen_id, id, name, ruolo_cucina, stations, weekly_quota, puo_fare_extra, aggiornato_il)
    values (
      p_kitchen, r->>'id', coalesce(r->>'name',''), nullif(r->>'role',''),
      coalesce(r->'stations', '[]'::jsonb),
      coalesce(r->'weeklyQuota', '[]'::jsonb),
      coalesce((r->>'puoFareExtra')::boolean, true),
      now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, ruolo_cucina = excluded.ruolo_cucina,
          stations = excluded.stations, weekly_quota = excluded.weekly_quota,
          puo_fare_extra = excluded.puo_fare_extra, aggiornato_il = now();

    if personali then
      insert into public.persone_personali as d (kitchen_id, id, phone, email, hours, user_id)
      values (p_kitchen, r->>'id',
              nullif(r->>'phone',''), nullif(r->>'email',''),
              nullif(r->>'hours','')::numeric,
              nullif(r->>'userId','')::uuid)
      on conflict (kitchen_id, id) do update
        set phone = excluded.phone, email = excluded.email,
            hours = excluded.hours, user_id = excluded.user_id;
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.salva_persone(uuid, jsonb) to authenticated;


-- ============================================================================
-- CONTROLLO
--   select * from public.leggi_persone('<id cucina>');
--   select public.my_staff_id('<id cucina>');   -- il tuo id in brigata, o null
-- ============================================================================
