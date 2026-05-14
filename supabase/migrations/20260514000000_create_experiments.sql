-- F28.1: Saved Experiment Definitions
create table if not exists experiments (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references des_models(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  config      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for listing experiments by model
create index if not exists experiments_model_id_idx on experiments(model_id);

-- Updated-at trigger
create or replace function update_experiments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger experiments_updated_at
  before update on experiments
  for each row execute function update_experiments_updated_at();

-- Row Level Security
alter table experiments enable row level security;

create policy "Users can read their own experiments"
  on experiments for select
  using (auth.uid() = user_id);

create policy "Users can insert their own experiments"
  on experiments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own experiments"
  on experiments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own experiments"
  on experiments for delete
  using (auth.uid() = user_id);
