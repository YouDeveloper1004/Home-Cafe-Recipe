-- Apply this migration to an existing RATIO Supabase project.
begin;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('cafe','recipe')),
  target_id text not null check (length(target_id) between 1 and 200),
  reason text not null check (reason in ('스팸','부적절한 콘텐츠','저작권 침해','기타')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "submit own report" on public.reports;
create policy "submit own report" on public.reports for insert to authenticated
with check (auth.uid() = reporter_id);
revoke all on public.reports from anon, authenticated;
grant insert on public.reports to authenticated;
create index if not exists reports_created_at_idx on public.reports (created_at desc);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_owner_id),
  check (blocker_id <> blocked_owner_id)
);
alter table public.blocks enable row level security;
drop policy if exists "read own blocks" on public.blocks;
drop policy if exists "create own blocks" on public.blocks;
drop policy if exists "delete own blocks" on public.blocks;
create policy "read own blocks" on public.blocks for select to authenticated
using (auth.uid() = blocker_id);
create policy "create own blocks" on public.blocks for insert to authenticated
with check (auth.uid() = blocker_id);
create policy "delete own blocks" on public.blocks for delete to authenticated
using (auth.uid() = blocker_id);
revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

create or replace function public.cafe_account_storage_paths() returns table(name text)
language sql security definer set search_path = '' stable as $$
  select objects.name from storage.objects as objects
  where objects.bucket_id='recipe-images'
    and (storage.foldername(objects.name))[1]=auth.uid()::text
$$;
revoke all on function public.cafe_account_storage_paths() from public, anon;
grant execute on function public.cafe_account_storage_paths() to authenticated;

create or replace function public.delete_cafe_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  delete from storage.objects
  where bucket_id='recipe-images'
    and (storage.foldername(name))[1]=uid::text;
  delete from auth.users where id=uid;
end $$;
revoke all on function public.delete_cafe_account() from public, anon;
grant execute on function public.delete_cafe_account() to authenticated;

commit;
