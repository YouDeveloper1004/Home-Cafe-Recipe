-- Private-by-default recipe media, per-account limits, and strict media ownership.
-- Existing `recipe-images` objects stay in place, but the bucket itself becomes
-- private. The new client signs approved legacy files and all new uploads go to
-- `recipe-media-private`.
begin;

update storage.buckets set public=false where id='recipe-images';
drop policy if exists "own image upload" on storage.objects;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'recipe-media-private',
  'recipe-media-private',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_upload_recipe_media(object_name text) returns boolean
language sql security definer set search_path='' stable as $$
  select auth.uid() is not null
    and (storage.foldername(object_name))[1]=auth.uid()::text
    and (select count(*) from storage.objects
      where bucket_id='recipe-media-private'
        and (storage.foldername(name))[1]=auth.uid()::text) < 100
    and coalesce((select sum(coalesce((metadata->>'size')::bigint,0)) from storage.objects
      where bucket_id='recipe-media-private'
        and (storage.foldername(name))[1]=auth.uid()::text),0) < 262144000
$$;
revoke all on function public.can_upload_recipe_media(text) from public, anon;
grant execute on function public.can_upload_recipe_media(text) to authenticated;

create or replace function public.is_approved_recipe_media(object_name text) returns boolean
language sql security definer set search_path='' stable as $$
  select exists(
    select 1
    from public.cafe_catalog as catalog
    cross join lateral jsonb_array_elements(catalog.recipes) as recipe(value)
    where recipe.value->>'photo'='ratio-media://'||object_name
      or recipe.value->>'photo'='ratio-legacy-media://'||object_name
      or position('/storage/v1/object/public/recipe-images/'||object_name in coalesce(recipe.value->>'photo',''))>0
      or exists(
        select 1 from jsonb_array_elements(recipe.value->'steps') as step(value)
        where step.value->'media'->>'uri'='ratio-media://'||object_name
          or step.value->'media'->>'uri'='ratio-legacy-media://'||object_name
          or position('/storage/v1/object/public/recipe-images/'||object_name in coalesce(step.value->'media'->>'uri',''))>0
      )
  )
$$;
revoke all on function public.is_approved_recipe_media(text) from public;
grant execute on function public.is_approved_recipe_media(text) to anon, authenticated;

drop policy if exists "private recipe media upload" on storage.objects;
drop policy if exists "private recipe media read" on storage.objects;
drop policy if exists "private recipe media delete" on storage.objects;
create policy "private recipe media upload" on storage.objects for insert to authenticated
with check (
  bucket_id='recipe-media-private'
  and public.can_upload_recipe_media(name)
);
create policy "private recipe media read" on storage.objects for select to anon, authenticated
using (
  bucket_id='recipe-media-private'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_approved_recipe_media(name)
  )
);
create policy "private recipe media delete" on storage.objects for delete to authenticated
using (
  bucket_id='recipe-media-private'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "approved legacy recipe media read" on storage.objects;
create policy "approved legacy recipe media read" on storage.objects for select to anon, authenticated
using (
  bucket_id='recipe-images'
  and public.is_approved_recipe_media(name)
);

create or replace function public.recipe_media_reference_is_valid(owner uuid, media_uri text) returns boolean
language sql security definer set search_path='' stable as $$
  select media_uri is null or media_uri=''
    or (
      media_uri like 'ratio-media://%'
      and (storage.foldername(substr(media_uri,length('ratio-media://')+1)))[1]=owner::text
      and exists(
        select 1 from storage.objects
        where bucket_id='recipe-media-private'
          and name=substr(media_uri,length('ratio-media://')+1)
      )
    )
    or (
      media_uri like 'https://%'
      and position('/storage/v1/object/public/recipe-images/'||owner::text||'/' in media_uri)>0
    )
    or (
      media_uri like 'ratio-legacy-media://%'
      and (storage.foldername(substr(media_uri,length('ratio-legacy-media://')+1)))[1]=owner::text
      and exists(
        select 1 from storage.objects
        where bucket_id='recipe-images'
          and name=substr(media_uri,length('ratio-legacy-media://')+1)
      )
    )
$$;
revoke all on function public.recipe_media_reference_is_valid(uuid,text) from public, anon, authenticated;

create or replace function public.save_cafe_account(next_state jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  entry jsonb;
  step_entry jsonb;
  approved_recipes jsonb;
  content_text text;
  steps_text text;
  entry_hash text;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(next_state) is distinct from 'object'
    or jsonb_typeof(next_state->'recipes') is distinct from 'array'
    or octet_length(next_state::text)>2000000
    or jsonb_array_length(next_state->'recipes')>100
  then raise exception 'Invalid account data'; end if;

  if next_state->'cafe'<>'null'::jsonb then
    if next_state->'cafe'->>'id' is distinct from uid::text
      or not coalesce((next_state->'cafe'->>'handle' ~ '^[a-z0-9_]{3,24}$'),false)
    then raise exception 'Invalid Cafe'; end if;

    for entry in select value from jsonb_array_elements(next_state->'recipes') loop
      if entry->>'cafeId' is distinct from uid::text
        or coalesce(length(entry->>'id'),0) not between 1 and 120
        or coalesce(length(entry->>'title'),0) not between 1 and 80
        or coalesce(length(entry->>'description'),0)>1000
        or jsonb_typeof(entry->'baseVolumeMl') is distinct from 'number'
        or (entry->>'baseVolumeMl')::numeric<=0
        or jsonb_typeof(entry->'steps') is distinct from 'array'
        or jsonb_array_length(entry->'steps') not between 1 and 50
        or not public.recipe_media_reference_is_valid(uid,entry->>'photo')
      then raise exception 'Invalid recipe'; end if;

      for step_entry in select value from jsonb_array_elements(entry->'steps') loop
        if coalesce(length(step_entry->>'title'),0) not between 1 and 500
          or (step_entry ? 'media' and not public.recipe_media_reference_is_valid(uid,step_entry->'media'->>'uri'))
        then raise exception 'Invalid recipe step'; end if;
      end loop;

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

drop function if exists public.cafe_account_storage_paths();
create function public.cafe_account_storage_paths()
returns table(bucket_id text,name text)
language sql security definer set search_path='' stable as $$
  select objects.bucket_id,objects.name from storage.objects as objects
  where objects.bucket_id in ('recipe-images','recipe-media-private')
    and (storage.foldername(objects.name))[1]=auth.uid()::text
$$;
revoke all on function public.cafe_account_storage_paths() from public, anon;
grant execute on function public.cafe_account_storage_paths() to authenticated;

create or replace function public.delete_cafe_account() returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  delete from storage.objects
  where bucket_id in ('recipe-images','recipe-media-private')
    and (storage.foldername(name))[1]=uid::text;
  delete from auth.users where id=uid;
end $$;
revoke all on function public.delete_cafe_account() from public, anon;
grant execute on function public.delete_cafe_account() to authenticated;

commit;
