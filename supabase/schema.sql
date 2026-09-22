-- Run once in your own Supabase project. No service-role key belongs in the app.
create table public.cafe_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.cafe_accounts enable row level security;
create policy "read own account" on public.cafe_accounts for select to authenticated using (auth.uid() = owner_id);
revoke all on public.cafe_accounts from anon, authenticated;
grant select on public.cafe_accounts to authenticated;

create table public.cafe_catalog (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  cafe jsonb not null,
  recipes jsonb not null check (jsonb_typeof(recipes) = 'array')
);
alter table public.cafe_catalog enable row level security;
create policy "read published catalog" on public.cafe_catalog for select to anon, authenticated using (true);
revoke all on public.cafe_catalog from anon, authenticated;
grant select on public.cafe_catalog to anon, authenticated;

create function public.save_cafe_account(next_state jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); entry jsonb;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(next_state) is distinct from 'object' or jsonb_typeof(next_state->'recipes') is distinct from 'array'
    or octet_length(next_state::text) > 2000000 then raise exception 'Invalid account data'; end if;
  if next_state->'cafe' <> 'null'::jsonb then
    if next_state->'cafe'->>'id' is distinct from uid::text or not coalesce((next_state->'cafe'->>'handle' ~ '^[a-z0-9_]{3,24}$'),false) then raise exception 'Invalid Cafe'; end if;
    for entry in select value from jsonb_array_elements(next_state->'recipes') loop
      if entry->>'cafeId' is distinct from uid::text or coalesce(length(entry->>'title'),0) = 0
        or jsonb_typeof(entry->'baseVolumeMl') is distinct from 'number' or (entry->>'baseVolumeMl')::numeric <= 0
        or jsonb_typeof(entry->'steps') is distinct from 'array' or jsonb_array_length(entry->'steps') = 0 then raise exception 'Invalid recipe'; end if;
    end loop;
    insert into public.cafe_catalog(owner_id,handle,cafe,recipes)
      values(uid,next_state->'cafe'->>'handle',next_state->'cafe',next_state->'recipes')
      on conflict(owner_id) do update set handle=excluded.handle,cafe=excluded.cafe,recipes=excluded.recipes;
  else
    delete from public.cafe_catalog where owner_id=uid;
  end if;
  insert into public.cafe_accounts(owner_id,state) values(uid,next_state)
    on conflict(owner_id) do update set state=excluded.state,updated_at=now();
end $$;
revoke all on function public.save_cafe_account(jsonb) from public, anon;
grant execute on function public.save_cafe_account(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recipe-images','recipe-images',true,10485760,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/3gpp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
update storage.buckets set public=false where id='recipe-images';
create policy "own image deletion" on storage.objects for delete to authenticated
using (bucket_id='recipe-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own image listing" on storage.objects for select to authenticated
using (bucket_id='recipe-images' and (storage.foldername(name))[1]=auth.uid()::text);

-- New uploads are private. The legacy public bucket above remains only so an
-- existing installation can migrate without breaking already-published media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recipe-media-private','recipe-media-private',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.can_upload_recipe_media(object_name text) returns boolean
language sql security definer set search_path='' stable as $$
  select auth.uid() is not null
    and (storage.foldername(object_name))[1]=auth.uid()::text
    and (select count(*) from storage.objects where bucket_id='recipe-media-private'
      and (storage.foldername(name))[1]=auth.uid()::text)<100
    and coalesce((select sum(coalesce((metadata->>'size')::bigint,0)) from storage.objects
      where bucket_id='recipe-media-private' and (storage.foldername(name))[1]=auth.uid()::text),0)<262144000
$$;
revoke all on function public.can_upload_recipe_media(text) from public, anon;
grant execute on function public.can_upload_recipe_media(text) to authenticated;

create function public.is_approved_recipe_media(object_name text) returns boolean
language sql security definer set search_path='' stable as $$
  select exists(select 1 from public.cafe_catalog as catalog
    cross join lateral jsonb_array_elements(catalog.recipes) as recipe(value)
    where recipe.value->>'photo'='ratio-media://'||object_name
      or recipe.value->>'photo'='ratio-legacy-media://'||object_name
      or position('/storage/v1/object/public/recipe-images/'||object_name in coalesce(recipe.value->>'photo',''))>0
      or exists(select 1 from jsonb_array_elements(recipe.value->'steps') as step(value)
        where step.value->'media'->>'uri'='ratio-media://'||object_name
          or step.value->'media'->>'uri'='ratio-legacy-media://'||object_name
          or position('/storage/v1/object/public/recipe-images/'||object_name in coalesce(step.value->'media'->>'uri',''))>0))
$$;
revoke all on function public.is_approved_recipe_media(text) from public;
grant execute on function public.is_approved_recipe_media(text) to anon, authenticated;

create policy "private recipe media upload" on storage.objects for insert to authenticated
with check(bucket_id='recipe-media-private' and public.can_upload_recipe_media(name));
create policy "private recipe media read" on storage.objects for select to anon, authenticated
using(bucket_id='recipe-media-private' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_approved_recipe_media(name)));
create policy "private recipe media delete" on storage.objects for delete to authenticated
using(bucket_id='recipe-media-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "approved legacy recipe media read" on storage.objects for select to anon, authenticated
using(bucket_id='recipe-images' and public.is_approved_recipe_media(name));

-- Release-readiness migration: reports are write-only to users. Service-role users
-- can review them in the Supabase dashboard because service-role bypasses RLS.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('cafe','recipe')),
  target_id text not null check (length(target_id) between 1 and 200),
  reason text not null check (reason in ('스팸','부적절한 콘텐츠','저작권 침해','기타')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
create unique index reports_one_open_target_idx
  on public.reports(reporter_id,target_type,target_id) where status='open';

create function public.submit_report(report_target_type text, report_target_id text, report_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
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
  if (select count(*) from public.reports where reporter_id=uid
      and created_at>now()-interval '1 hour') >= 10
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

create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_owner_id),
  check (blocker_id <> blocked_owner_id)
);
alter table public.blocks enable row level security;
create policy "read own blocks" on public.blocks for select to authenticated using (auth.uid() = blocker_id);
create policy "create own blocks" on public.blocks for insert to authenticated with check (auth.uid() = blocker_id);
create policy "delete own blocks" on public.blocks for delete to authenticated using (auth.uid() = blocker_id);
revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- The client passes these exact names to the Storage API, which removes both the
-- physical objects and their metadata. Returning names also covers future nested folders.
create function public.cafe_account_storage_paths() returns table(bucket_id text,name text)
language sql security definer set search_path = '' stable as $$
  select objects.bucket_id,objects.name from storage.objects as objects
  where objects.bucket_id in ('recipe-images','recipe-media-private')
    and (storage.foldername(objects.name))[1]=auth.uid()::text
$$;
revoke all on function public.cafe_account_storage_paths() from public, anon;
grant execute on function public.cafe_account_storage_paths() to authenticated;

create function public.delete_cafe_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  -- Storage API deletion happens first in the client. This removes any leftover
  -- metadata before deleting the user and makes public URLs return 404.
  delete from storage.objects
  where bucket_id in ('recipe-images','recipe-media-private') and (storage.foldername(name))[1]=uid::text;
  delete from auth.users where id=uid;
end $$;
revoke all on function public.delete_cafe_account() from public, anon;
grant execute on function public.delete_cafe_account() to authenticated;
