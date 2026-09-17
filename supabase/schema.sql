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
create policy "own image upload" on storage.objects for insert to authenticated
with check (bucket_id='recipe-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own image deletion" on storage.objects for delete to authenticated
using (bucket_id='recipe-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own image listing" on storage.objects for select to authenticated
using (bucket_id='recipe-images' and (storage.foldername(name))[1]=auth.uid()::text);

create function public.delete_cafe_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from auth.users where id=auth.uid();
end $$;
revoke all on function public.delete_cafe_account() from public, anon;
grant execute on function public.delete_cafe_account() to authenticated;
