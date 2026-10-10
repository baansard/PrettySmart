-- Pet care, phase 1: buying pets, equipment and supplies.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- After this, only the C# server (using the server-only "secret" key) can add quiz answers,
-- purchases, inventory and pets. Players can still READ their own rows.

-- ── Tables ──────────────────────────────────────────────────────────────────

-- Every purchase ever made. Coins spent = sum of price_paid.
create table if not exists public.purchases (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  item_id       text        not null,          -- catalog id, e.g. 'cat', 'fountain', 'drycatfood'
  quantity      integer     not null default 1 check (quantity > 0),
  price_paid    integer     not null check (price_paid >= 0),
  purchased_at  timestamptz not null default now()
);
create index if not exists purchases_user on public.purchases (user_id);

-- Equipment and supplies you own, with how many.
create table if not exists public.inventory (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  item_id     text        not null,
  quantity    integer     not null default 0 check (quantity >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Each pet you own (you can own many of the same species).
create table if not exists public.pets (
  id           bigint generated always as identity primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  species_id   text        not null,           -- catalog id, e.g. 'cat', 'neontetra'
  kind         text        not null check (kind in ('cat', 'fish')),
  nickname     text        check (char_length(nickname) <= 40),
  status       text        not null default 'healthy' check (status in ('healthy', 'sick', 'dead')),
  acquired_at  timestamptz not null default now()
);
create index if not exists pets_user on public.pets (user_id);

-- ── Row Level Security: read your own, only the server writes ───────────────

alter table public.purchases enable row level security;
alter table public.inventory enable row level security;
alter table public.pets      enable row level security;

drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases for select using (auth.uid() = user_id);

drop policy if exists "read own inventory" on public.inventory;
create policy "read own inventory" on public.inventory for select using (auth.uid() = user_id);

drop policy if exists "read own pets" on public.pets;
create policy "read own pets" on public.pets for select using (auth.uid() = user_id);

-- Quiz answers earn coins, so players can no longer add them directly — the server grades and records them.
drop policy if exists "add own answers" on public.quiz_answers;

-- ── Functions (callable only by the server) ─────────────────────────────────

-- Coins = points earned from quiz answers − coins spent.
create or replace function public.coin_balance(p_user uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select (coalesce((select sum(points)     from public.quiz_answers where user_id = p_user), 0)
        - coalesce((select sum(price_paid) from public.purchases    where user_id = p_user), 0))::integer
$$;

-- Buys one item as a single all-or-nothing step. The server decides the price and checks
-- requirements first; this re-checks the balance under a per-player lock so two quick clicks
-- can't spend the same coins twice.
create or replace function public.buy_item(p_user uuid, p_item text, p_kind text, p_price integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_balance integer;
  v_pet_id  bigint;
begin
  perform pg_advisory_xact_lock(hashtext('buy:' || p_user::text));

  v_balance := public.coin_balance(p_user);
  if v_balance < p_price then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_coins', 'balance', v_balance);
  end if;

  insert into public.purchases (user_id, item_id, quantity, price_paid)
  values (p_user, p_item, 1, p_price);

  if p_kind in ('cat', 'fish') then
    insert into public.pets (user_id, species_id, kind)
    values (p_user, p_item, p_kind)
    returning id into v_pet_id;
  else
    insert into public.inventory (user_id, item_id, quantity)
    values (p_user, p_item, 1)
    on conflict (user_id, item_id)
    do update set quantity = public.inventory.quantity + 1, updated_at = now();
  end if;

  return jsonb_build_object('ok', true, 'balance', v_balance - p_price, 'petId', v_pet_id);
end
$$;

revoke all on function public.coin_balance(uuid)                     from public, anon, authenticated;
revoke all on function public.buy_item(uuid, text, text, integer)     from public, anon, authenticated;
grant execute on function public.coin_balance(uuid)                   to service_role;
grant execute on function public.buy_item(uuid, text, text, integer)  to service_role;
