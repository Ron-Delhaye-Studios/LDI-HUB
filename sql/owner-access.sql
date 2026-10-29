-- Run AFTER creating your owner account in Supabase Authentication > Users.
-- Replace the email below before running. No application tables are recreated.
begin;

do $migration$
declare
  owner_email constant text := 'REPLACE_WITH_YOUR_OWNER_EMAIL';
  owner_id uuid;
  table_name text;
begin
  if owner_email = 'REPLACE_WITH_YOUR_OWNER_EMAIL' then
    raise exception 'Replace owner_email with the email of your Supabase Auth owner account.';
  end if;

  select id into strict owner_id from auth.users
    where lower(email) = lower(owner_email) and is_anonymous = false;

  foreach table_name in array array['projects', 'payloads', 'system_nodes'] loop
    execute format('alter table public.%I enable row level security', table_name);

    -- Remove broad default privileges, including TRUNCATE, from browser roles.
    execute format('revoke all on table public.%I from PUBLIC, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);

    execute format('drop policy if exists ldi_owner_access on public.%I', table_name);
    execute format('drop policy if exists ldi_owner_boundary on public.%I', table_name);

    -- FOR ALL covers SELECT, INSERT, UPDATE and DELETE.
    execute format(
      'create policy ldi_owner_access on public.%I as permissive for all to authenticated
       using ((select auth.uid()) = %L::uuid)
       with check ((select auth.uid()) = %L::uuid)',
      table_name, owner_id, owner_id
    );

    -- Existing permissive policies cannot widen this owner-only boundary.
    execute format(
      'create policy ldi_owner_boundary on public.%I as restrictive for all to PUBLIC
       using ((select auth.uid()) = %L::uuid)
       with check ((select auth.uid()) = %L::uuid)',
      table_name, owner_id, owner_id
    );
  end loop;
end;
$migration$;

grant usage on schema public to authenticated;
commit;

-- Verify all three tables show both policies and owner UUID predicates:
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects', 'payloads', 'system_nodes')
order by tablename, policyname;
