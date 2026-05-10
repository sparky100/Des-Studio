-- Sprint 15 fix: allow public read of runs/models behind active share links

alter table public.simulation_runs enable row level security;
alter table public.des_models enable row level security;

drop policy if exists "Anyone can read runs for shared dashboards" on public.simulation_runs;
create policy "Anyone can read runs for shared dashboards"
  on public.simulation_runs for select to public
  using (
    exists (
      select 1 from public.share_links
      where share_links.run_id = simulation_runs.id
      and share_links.revoked_at is null
    )
  );

drop policy if exists "Anyone can read models for shared dashboards" on public.des_models;
create policy "Anyone can read models for shared dashboards"
  on public.des_models for select to public
  using (
    exists (
      select 1 from public.share_links
      join public.simulation_runs on simulation_runs.id = share_links.run_id
      where simulation_runs.model_id = des_models.id
      and share_links.revoked_at is null
    )
  );
