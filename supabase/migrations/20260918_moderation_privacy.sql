-- Free release-hardening: pre-publication moderation and abuse-resistant reports.
begin;

alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists review_note text;
alter table public.reports add column if not exists reviewed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='reports_status_check') then
    alter table public.reports add constraint reports_status_check
      check (status in ('open','resolved','dismissed'));
  end if;
end $$;
create unique index if not exists reports_one_open_target_idx
  on public.reports(reporter_id,target_type,target_id) where status='open';

drop policy if exists "submit own report" on public.reports;
revoke all on public.reports from anon, authenticated;

create or replace function public.submit_report(
  report_target_type text,
  report_target_id text,
  report_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); created_id uuid;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if report_target_type not in ('cafe','recipe')
    or length(report_target_id) not between 1 and 200
    or report_reason not in ('스팸','부적절한 콘텐츠','저작권 침해','기타')
  then raise exception 'Invalid report'; end if;
  if report_target_type='cafe' and not exists(
    select 1 from public.cafe_catalog where owner_id::text=report_target_id
  ) then raise exception 'Target not found'; end if;
  if report_target_type='recipe' and not exists(
    select 1 from public.cafe_catalog as catalog
    cross join lateral jsonb_array_elements(catalog.recipes) as recipe(value)
    where recipe.value->>'id'=report_target_id
  ) then raise exception 'Target not found'; end if;
  if (select count(*) from public.reports
      where reporter_id=uid and created_at>now()-interval '1 hour') >= 10
  then raise exception 'Too many reports. Try again later.'; end if;
  if exists(select 1 from public.reports where reporter_id=uid
      and target_type=report_target_type and target_id=report_target_id and status='open')
  then raise exception 'Already reported'; end if;
  insert into public.reports(reporter_id,target_type,target_id,reason)
  values(uid,report_target_type,report_target_id,report_reason)
  returning id into created_id;
  return created_id;
end $$;
revoke all on function public.submit_report(text,text,text) from public, anon;
grant execute on function public.submit_report(text,text,text) to authenticated;

create table if not exists public.moderation_blocked_terms (
  term text primary key check (length(term) between 2 and 80),
  category text not null default 'unsafe'
);
alter table public.moderation_blocked_terms enable row level security;
revoke all on public.moderation_blocked_terms from anon, authenticated;
insert into public.moderation_blocked_terms(term,category) values
  ('불법도박','illegal'),
  ('마약판매','illegal'),
  ('성인광고','sexual'),
  ('조건만남','sexual'),
  ('대포통장','illegal')
on conflict(term) do nothing;

create table if not exists public.recipe_moderation (
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null,
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key(owner_id,recipe_id)
);
alter table public.recipe_moderation enable row level security;
drop policy if exists "read own recipe moderation" on public.recipe_moderation;
create policy "read own recipe moderation" on public.recipe_moderation for select to authenticated
using(auth.uid()=owner_id);
revoke all on public.recipe_moderation from anon, authenticated;
grant select on public.recipe_moderation to authenticated;
create index if not exists recipe_moderation_queue_idx
  on public.recipe_moderation(status,created_at);

-- Preserve currently published recipes as approved when this migration is first applied.
insert into public.recipe_moderation(owner_id,recipe_id,content_hash,status,reviewed_at)
select catalog.owner_id, recipe.value->>'id', md5(recipe.value::text), 'approved', now()
from public.cafe_catalog as catalog
cross join lateral jsonb_array_elements(catalog.recipes) as recipe(value)
where coalesce(recipe.value->>'id','')<>''
on conflict(owner_id,recipe_id) do nothing;

create or replace function public.sync_moderated_catalog(target_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.cafe_catalog as catalog
  set recipes=coalesce((
    select jsonb_agg(item.value order by item.ordinality)
    from public.cafe_accounts as account
    cross join lateral jsonb_array_elements(account.state->'recipes')
      with ordinality as item(value,ordinality)
    join public.recipe_moderation as moderation
      on moderation.owner_id=account.owner_id
      and moderation.recipe_id=item.value->>'id'
      and moderation.status='approved'
    where account.owner_id=target_owner
  ),'[]'::jsonb)
  where catalog.owner_id=target_owner;
end $$;
revoke all on function public.sync_moderated_catalog(uuid) from public, anon, authenticated;

create or replace function public.sync_moderated_catalog_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform public.sync_moderated_catalog(old.owner_id);
    return old;
  end if;
  perform public.sync_moderated_catalog(new.owner_id);
  return new;
end $$;
drop trigger if exists recipe_moderation_catalog_sync on public.recipe_moderation;
create trigger recipe_moderation_catalog_sync
after insert or update or delete on public.recipe_moderation
for each row execute function public.sync_moderated_catalog_trigger();

create or replace function public.save_cafe_account(next_state jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  entry jsonb;
  approved_recipes jsonb;
  content_text text;
  steps_text text;
  entry_hash text;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(next_state) is distinct from 'object'
    or jsonb_typeof(next_state->'recipes') is distinct from 'array'
    or octet_length(next_state::text)>2000000
  then raise exception 'Invalid account data'; end if;

  if next_state->'cafe'<>'null'::jsonb then
    if next_state->'cafe'->>'id' is distinct from uid::text
      or not coalesce((next_state->'cafe'->>'handle' ~ '^[a-z0-9_]{3,24}$'),false)
    then raise exception 'Invalid Cafe'; end if;

    for entry in select value from jsonb_array_elements(next_state->'recipes') loop
      if entry->>'cafeId' is distinct from uid::text
        or coalesce(length(entry->>'title'),0)=0
        or jsonb_typeof(entry->'baseVolumeMl') is distinct from 'number'
        or (entry->>'baseVolumeMl')::numeric<=0
        or jsonb_typeof(entry->'steps') is distinct from 'array'
        or jsonb_array_length(entry->'steps')=0
      then raise exception 'Invalid recipe'; end if;

      select string_agg(concat_ws(' ',step.value->>'title',step.value->>'value'),' ')
      into steps_text from jsonb_array_elements(entry->'steps') as step(value);
      content_text=lower(concat_ws(' ',
        next_state->'cafe'->>'name',next_state->'cafe'->>'bio',
        entry->>'title',entry->>'description',entry->>'equipment',
        entry->'bean'->>'product',entry->'bean'->>'roaster',
        entry->'bean'->>'origin',entry->'bean'->>'note',steps_text));
      if content_text ~ '(https?://|www\.|t\.me/)' then
        raise exception 'External links are not allowed in recipes'; end if;
      if exists(select 1 from public.moderation_blocked_terms
        where position(lower(term) in content_text)>0)
      then raise exception 'Content contains a blocked term'; end if;

      entry_hash=md5(entry::text);
      insert into public.recipe_moderation as moderation(owner_id,recipe_id,content_hash,status)
      values(uid,entry->>'id',entry_hash,'pending')
      on conflict(owner_id,recipe_id) do update
      set content_hash=excluded.content_hash,
          status=case when moderation.content_hash is distinct from excluded.content_hash
            then 'pending' else moderation.status end,
          review_note=case when moderation.content_hash is distinct from excluded.content_hash
            then null else moderation.review_note end,
          reviewed_at=case when moderation.content_hash is distinct from excluded.content_hash
            then null else moderation.reviewed_at end,
          updated_at=now();
    end loop;

    delete from public.recipe_moderation as moderation
    where moderation.owner_id=uid and not exists(
      select 1 from jsonb_array_elements(next_state->'recipes') as recipe(value)
      where recipe.value->>'id'=moderation.recipe_id
    );

    select coalesce(jsonb_agg(recipe.value order by recipe.ordinality),'[]'::jsonb)
    into approved_recipes
    from jsonb_array_elements(next_state->'recipes') with ordinality as recipe(value,ordinality)
    join public.recipe_moderation as moderation
      on moderation.owner_id=uid and moderation.recipe_id=recipe.value->>'id'
      and moderation.status='approved';

    insert into public.cafe_catalog(owner_id,handle,cafe,recipes)
    values(uid,next_state->'cafe'->>'handle',next_state->'cafe',approved_recipes)
    on conflict(owner_id) do update
    set handle=excluded.handle,cafe=excluded.cafe,recipes=excluded.recipes;
  else
    delete from public.cafe_catalog where owner_id=uid;
    delete from public.recipe_moderation where owner_id=uid;
  end if;

  insert into public.cafe_accounts(owner_id,state) values(uid,next_state)
  on conflict(owner_id) do update set state=excluded.state,updated_at=now();
end $$;
revoke all on function public.save_cafe_account(jsonb) from public, anon;
grant execute on function public.save_cafe_account(jsonb) to authenticated;

commit;
