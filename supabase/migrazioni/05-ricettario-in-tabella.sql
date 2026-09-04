-- ============================================================================
-- LA QUARTA FETTA: sub-ricette, piatti, menu.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
--
-- QUI IL GUADAGNO PIÙ GROSSO NON SONO I NUMERI: SONO LE FOTO.
-- Una foto di piatto è un data URL da qualche centinaio di kilobyte, e nel
-- blob stava dentro l'elenco: cambiare il PREZZO di un piatto rispediva le
-- foto di TUTTI gli altri. Dieci piatti con foto erano tre megabyte per
-- correggere una cifra. Adesso la foto sta sulla sua riga e non si muove se
-- non la si tocca.
--
-- La separazione dei costi è la stessa degli ingredienti: `priceActual` e
-- `foodCostTargetPct` sono gli unici campi che oggi `reddigi_sezione` toglie
-- ai piatti, e vanno in una tabella a parte.
-- ============================================================================


-- ---- 1. Le sub-ricette -----------------------------------------------------
-- Fondi, salse, basi. Non hanno niente di riservato: il costo si CALCOLA dai
-- componenti, e chi non vede i prezzi degli ingredienti non lo può ricostruire
-- comunque.
create table if not exists public.sub_ricette (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  name       text not null,
  -- I componenti restano JSON: sono righe che vivono DENTRO la ricetta, e
  -- l'unica cosa che si fa con loro è leggerle tutte insieme. Spezzarle
  -- vorrebbe dire una join per disegnare una scheda.
  items      jsonb not null default '[]'::jsonb,
  yield_qty  text,
  yield_unit text not null default 'kg',
  notes      text,
  photo      text,
  aggiornato_il timestamptz not null default now(),
  primary key (kitchen_id, id)
);

-- ---- 2. I piatti -----------------------------------------------------------
create table if not exists public.piatti (
  kitchen_id  uuid not null references public.kitchens(id) on delete cascade,
  id          text not null,
  name        text not null,
  category    text,
  items       jsonb not null default '[]'::jsonb,
  portion_g   text,
  allergens   jsonb not null default '[]'::jsonb,
  steps       text,
  prep_min    text,
  notes       text,
  -- LA FOTO STA QUI, sulla riga del suo piatto. Nel blob era il campo che
  -- faceva pesare tutto: cambiare un prezzo rispediva le foto di tutti.
  photo       text,
  aggiornato_il timestamptz not null default now(),
  primary key (kitchen_id, id)
);

-- ---- 3. Quello che è RISERVATO nei piatti ---------------------------------
-- Prezzo di vendita e food cost obiettivo: sono gli unici due campi che oggi
-- vengono tolti a chi non vede i costi. Stessa forma degli ingredienti.
create table if not exists public.piatti_costi (
  kitchen_id     uuid not null references public.kitchens(id) on delete cascade,
  id             text not null,
  price_actual   text,
  food_cost_target numeric,
  primary key (kitchen_id, id),
  foreign key (kitchen_id, id) references public.piatti(kitchen_id, id) on delete cascade
);

-- ---- 4. I menu -------------------------------------------------------------
-- Un menu è un nome e una sequenza di piatti. I prezzi non stanno qui: si
-- leggono dai piatti, e chi non li vede non li vede nemmeno da qui.
create table if not exists public.menu (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  name       text not null,
  -- L'ORDINE È IL DATO: un menu degustazione ha una sequenza, e un array JSON
  -- la conserva. Una tabella di righe con un `posizione` da riordinare a mano
  -- darebbe lo stesso risultato con più modi di sbagliarlo.
  recipe_ids jsonb not null default '[]'::jsonb,
  aggiornato_il timestamptz not null default now(),
  primary key (kitchen_id, id)
);

alter table public.sub_ricette  enable row level security;
alter table public.piatti       enable row level security;
alter table public.piatti_costi enable row level security;
alter table public.menu         enable row level security;


-- ---- 5. Le policy ----------------------------------------------------------
-- Ricette, piatti e menu li legge ogni membro: servono per cucinare. I costi
-- dei piatti no.

do $$
declare t text;
begin
  foreach t in array array['sub_ricette', 'piatti', 'menu'] loop
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

drop policy if exists piatti_costi_select on public.piatti_costi;
create policy piatti_costi_select on public.piatti_costi
  for select using (public.vede_costi(kitchen_id));

drop policy if exists piatti_costi_insert on public.piatti_costi;
create policy piatti_costi_insert on public.piatti_costi
  for insert with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists piatti_costi_update on public.piatti_costi;
create policy piatti_costi_update on public.piatti_costi
  for update using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id))
  with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists piatti_costi_delete on public.piatti_costi;
create policy piatti_costi_delete on public.piatti_costi
  for delete using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));


-- ---- 6. Leggere e salvare --------------------------------------------------

create or replace function public.leggi_sub_ricette(p_kitchen uuid)
returns table (id text, name text, items jsonb, "yieldQty" text, "yieldUnit" text,
               notes text, photo text)
language sql security invoker stable set search_path = public as $$
  select id, name, items, yield_qty, yield_unit, notes, photo
    from public.sub_ricette where kitchen_id = p_kitchen order by lower(name);
$$;
grant execute on function public.leggi_sub_ricette(uuid) to authenticated;

create or replace function public.salva_sub_ricette(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.sub_ricette as s
      (kitchen_id, id, name, items, yield_qty, yield_unit, notes, photo, aggiornato_il)
    values (p_kitchen, r->>'id', coalesce(r->>'name',''),
            coalesce(r->'items','[]'::jsonb), nullif(r->>'yieldQty',''),
            coalesce(nullif(r->>'yieldUnit',''),'kg'), nullif(r->>'notes',''),
            nullif(r->>'photo',''), now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, items = excluded.items, yield_qty = excluded.yield_qty,
          yield_unit = excluded.yield_unit, notes = excluded.notes,
          photo = excluded.photo, aggiornato_il = now();
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_sub_ricette(uuid, jsonb) to authenticated;

create or replace function public.leggi_piatti(p_kitchen uuid)
returns table (id text, name text, category text, items jsonb, "portionG" text,
               allergens jsonb, steps text, "prepMin" text, notes text, photo text,
               "priceActual" text, "foodCostTargetPct" numeric)
language sql security invoker stable set search_path = public as $$
  select p.id, p.name, p.category, p.items, p.portion_g, p.allergens, p.steps,
         p.prep_min, p.notes, p.photo, c.price_actual, c.food_cost_target
    from public.piatti p
    left join public.piatti_costi c on c.kitchen_id = p.kitchen_id and c.id = p.id
   where p.kitchen_id = p_kitchen order by lower(p.name);
$$;
grant execute on function public.leggi_piatti(uuid) to authenticated;

create or replace function public.salva_piatti(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0; costi boolean := public.vede_costi(p_kitchen);
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.piatti as p
      (kitchen_id, id, name, category, items, portion_g, allergens, steps,
       prep_min, notes, photo, aggiornato_il)
    values (p_kitchen, r->>'id', coalesce(r->>'name',''), nullif(r->>'category',''),
            coalesce(r->'items','[]'::jsonb), nullif(r->>'portionG',''),
            coalesce(r->'allergens','[]'::jsonb), nullif(r->>'steps',''),
            nullif(r->>'prepMin',''), nullif(r->>'notes',''), nullif(r->>'photo',''), now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, category = excluded.category, items = excluded.items,
          portion_g = excluded.portion_g, allergens = excluded.allergens,
          steps = excluded.steps, prep_min = excluded.prep_min,
          notes = excluded.notes, photo = excluded.photo, aggiornato_il = now();

    if costi then
      insert into public.piatti_costi as c (kitchen_id, id, price_actual, food_cost_target)
      values (p_kitchen, r->>'id', nullif(r->>'priceActual',''),
              nullif(r->>'foodCostTargetPct','')::numeric)
      on conflict (kitchen_id, id) do update
        set price_actual = excluded.price_actual, food_cost_target = excluded.food_cost_target;
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_piatti(uuid, jsonb) to authenticated;

create or replace function public.leggi_menu(p_kitchen uuid)
returns table (id text, name text, "recipeIds" jsonb)
language sql security invoker stable set search_path = public as $$
  select id, name, recipe_ids from public.menu where kitchen_id = p_kitchen order by lower(name);
$$;
grant execute on function public.leggi_menu(uuid) to authenticated;

create or replace function public.salva_menu(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.menu as m (kitchen_id, id, name, recipe_ids, aggiornato_il)
    values (p_kitchen, r->>'id', coalesce(r->>'name',''),
            coalesce(r->'recipeIds','[]'::jsonb), now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, recipe_ids = excluded.recipe_ids, aggiornato_il = now();
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_menu(uuid, jsonb) to authenticated;


-- ============================================================================
-- CONTROLLO
--   select count(*) from public.piatti;
--   select * from public.leggi_piatti('<id cucina>');
-- ============================================================================
