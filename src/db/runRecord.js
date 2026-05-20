import { supabase } from './supabase.js';

export function compareResults(newResult, storedResult) {
  const fields = ['served', 'avgWait', 'avgSvc', 'avgSojourn', 'reneged'];
  return fields.every(f =>
    Math.abs((newResult.summary[f] || 0) - (storedResult.summary[f] || 0)) < 0.0001
  );
}

export const buildRunRecord = (model, results, experimentConfig, resolvedSeed) => {
  // Deep clone at this exact moment — snapshot must never reference the live model.
  // Any subsequent edit to the model must NOT affect this snapshot.
  const snapshot = JSON.parse(JSON.stringify(model));

  return {
    model_id:         model.id,
    model_snapshot:   snapshot,
    engine_version:   import.meta.env.VITE_ENGINE_VERSION || '55a',
    prng_algorithm:   'mulberry32',
    base_seed:        resolvedSeed,
    experiment_config: {
      maxSimTime:           experimentConfig.maxSimTime,
      warmupPeriod:         experimentConfig.warmupPeriod,
      replications:         experimentConfig.replications,
      seed:                 resolvedSeed,
      terminationMode:      experimentConfig.terminationMode,
      terminationCondition: experimentConfig.terminationCondition ?? null,
    },
    summary:   results.summary ?? results,
    run_label: '',
  };
};

// Updates narrative_text and model_description_text for a run record.
// Each field may only be SET once (from null); the DB trigger enforces this.
// The WHERE narrative_text IS NULL guard avoids triggering a DB error when
// a narrative has already been written.
export const updateRunNarrative = async (runId, narrativeText, modelDescriptionText) => {
  const { error } = await supabase
    .from('simulation_runs')
    .update({
      narrative_text:          narrativeText,
      model_description_text:  modelDescriptionText,
    })
    .eq('id', runId)
    .is('narrative_text', null);
  if (error) throw error;
};
