#!/usr/bin/env node
// scripts/migrate-schedules.js
//
// ADR-016 Phase 2: Batch migration of inline schedule rows[] from des_models
// into the model_schedules table.
//
// Usage:
//   node scripts/migrate-schedules.js [--dry-run] [--model-id <uuid>]
//
// Options:
//   --dry-run        Preview which models would be migrated without making changes
//   --model-id <id>  Migrate only the specified model (default: all models with inline rows)
//
// Prerequisites:
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars must be set.
//   Run `npm install` first.
//
// Safety:
//   - Idempotent: models that already have scheduleRef set are skipped.
//   - Backs up original b_events to a JSON file before modifying.
//   - Uses a transaction-like pattern: schedule is saved first, then the model
//     is updated. If the model update fails, the schedule row can be manually
//     deleted (the bEvent retains inline rows until the update succeeds).

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const MODEL_ID_IDX = process.argv.indexOf('--model-id');
const TARGET_MODEL_ID = MODEL_ID_IDX !== -1 ? process.argv[MODEL_ID_IDX + 1] : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasInlineRows(bEvents) {
  return (bEvents || []).some(be =>
    (be.schedules || []).some(s =>
      Array.isArray(s.rows) && s.rows.length > 0 && !s.scheduleRef
    )
  );
}

function extractScheduleJson(bEvents) {
  const scheduleJson = [];
  for (const be of bEvents || []) {
    for (const s of be.schedules || []) {
      if (Array.isArray(s.rows) && s.rows.length > 0 && !s.scheduleRef) {
        scheduleJson.push({ eventId: s.eventId ?? be.id, rows: s.rows });
      }
    }
  }
  return scheduleJson;
}

function patchBEventsWithRef(bEvents, scheduleId) {
  return (bEvents || []).map(be => ({
    ...be,
    schedules: (be.schedules || []).map(s => {
      if (Array.isArray(s.rows) && s.rows.length > 0 && !s.scheduleRef) {
        return { ...s, rows: [], scheduleRef: scheduleId };
      }
      return s;
    }),
  }));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== ADR-016 Schedule Migration ${DRY_RUN ? '[DRY RUN]' : ''} ===\n`);

  // Fetch models to migrate
  let query = supabase
    .from('des_models')
    .select('id, name, b_events, owner_id');

  if (TARGET_MODEL_ID) {
    query = query.eq('id', TARGET_MODEL_ID);
  }

  const { data: models, error: fetchErr } = await query;
  if (fetchErr) {
    console.error('Failed to fetch models:', fetchErr.message);
    process.exit(1);
  }

  // Filter to only models with inline rows
  const toMigrate = models.filter(m => hasInlineRows(m.b_events));

  if (toMigrate.length === 0) {
    console.log('No models with inline schedule rows found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${toMigrate.length} model(s) with inline schedule rows:\n`);
  for (const m of toMigrate) {
    const bEvents = m.b_events || [];
    const totalRows = bEvents.reduce((sum, be) =>
      sum + (be.schedules || []).reduce((s2, sched) =>
        s2 + (Array.isArray(sched.rows) ? sched.rows.length : 0), 0), 0);
    console.log(`  - ${m.name} (${m.id}) — ${totalRows} schedule rows`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes made.');
    return;
  }

  // Create backup directory
  const backupDir = join(process.cwd(), '.schedule-migration-backup');
  mkdirSync(backupDir, { recursive: true });

  let succeeded = 0;
  let failed = 0;

  for (const m of toMigrate) {
    console.log(`Migrating: ${m.name} (${m.id})`);

    // Backup original b_events
    const backupPath = join(backupDir, `${m.id}.b_events.json`);
    writeFileSync(backupPath, JSON.stringify(m.b_events, null, 2));

    // Extract schedule JSON
    const scheduleJson = extractScheduleJson(m.b_events);

    // Save to model_schedules
    const { data: sched, error: schedErr } = await supabase
      .from('model_schedules')
      .insert({
        model_id:      m.id,
        name:          'Default Schedule',
        description:   'Migrated from inline bEvent rows (ADR-016)',
        schedule_json: scheduleJson,
        is_default:    true,
        created_by:    m.owner_id,
      })
      .select()
      .single();

    if (schedErr) {
      console.error(`  ✗ Failed to save schedule for ${m.id}: ${schedErr.message}`);
      failed++;
      continue;
    }

    console.log(`  ✓ Created schedule ${sched.id} (${scheduleJson.length} event entries)`);

    // Update bEvents with scheduleRef
    const updatedBEvents = patchBEventsWithRef(m.b_events, sched.id);

    const { error: updateErr } = await supabase
      .from('des_models')
      .update({ b_events: updatedBEvents })
      .eq('id', m.id);

    if (updateErr) {
      console.error(`  ✗ Failed to update model ${m.id}: ${updateErr.message}`);
      console.error(`    Schedule ${sched.id} was created but bEvents not updated.`);
      console.error(`    To rollback: DELETE FROM model_schedules WHERE id = '${sched.id}'`);
      failed++;
      continue;
    }

    console.log(`  ✓ Updated bEvents with scheduleRef → ${sched.id}`);
    console.log(`  ✓ Backup saved to ${backupPath}`);
    succeeded++;
  }

  console.log(`\n=== Migration complete ===`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);

  if (failed > 0) {
    console.error('\nSome models failed to migrate. Check logs above.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
