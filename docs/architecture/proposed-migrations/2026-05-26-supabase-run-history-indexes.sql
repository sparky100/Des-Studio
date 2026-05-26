-- Proposed migration only — not applied by this task.
-- Purpose: improve run-history and share-link lookup paths for DES Studio.

begin;

-- Primary run-history query shape in src/db/models.js:
--   where model_id = ?
--     and archived = ?
--   order by ran_at desc
--   limit 20
create index if not exists simulation_runs_model_archived_ran_at_idx
  on public.simulation_runs(model_id, archived, ran_at desc);

-- Share-link listing currently gathers run ids for a model and then queries
-- share_links by run_id ordered by created_at.
create index if not exists share_links_run_id_created_at_idx
  on public.share_links(run_id, created_at desc);

commit;
