/**
 * simmodlr — Public Engine API
 *
 * Stable public surface for embedding the simulation engine. All exports
 * here are part of the documented public contract; internal engine helpers
 * (phases.js, macros.js, entities.js, etc.) are not.
 *
 * Quick start:
 *   import { buildEngine, validateModel } from './src/engine/public-api.js';
 *
 *   const { errors } = validateModel(model);
 *   if (errors.length) throw new Error(errors[0].message);
 *
 *   const engine = buildEngine(model, seed, warmupPeriod, maxSimTime);
 *   const result = engine.runAll();
 *   console.log(result.summary.avgWait, result.summary.totalCost);
 */

export { buildEngine }          from './index.js';
export { validateModel }        from './validation.js';
export { runReplications, createReplicationPool } from './replication-runner.js';
export {
  summarizeReplicationResults,
  confidenceInterval95,
  compareScenarios,
  batchMeansCI,
  oneWayANOVA,
  tukeyHSD,
  fitDistribution,
}                               from './statistics.js';
export { mulberry32 }           from './distributions.js';
