// @ts-check
// engine/queue-refs.js — model reference propagation for queue, entity-type, state-variable, and container renames
import { mapConditionVariables } from "../model/conditionFormat.js";

/** @param {any} [value] */
function norm(value = "") {
  return String(value || "").trim().toLowerCase();
}

/** @param {any} [value] */
function esc(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {any} [text]
 * @param {string} oldName
 * @param {string} newName
 */
function replaceQueueToken(text = "", oldName = "", newName = "") {
  if (!oldName || !newName) return text;
  return String(text || "").replace(
    new RegExp(`queue\\(${esc(oldName)}\\)`, "gi"),
    `queue(${newName})`
  );
}

/**
 * @param {any} [text]
 * @param {string} oldName
 * @param {string} newName
 */
function replaceServerTokens(text = "", oldName = "", newName = "") {
  if (!oldName || !newName) return text;
  return String(text || "")
    .replace(new RegExp(`idle\\(${esc(oldName)}\\)\\.count`, "gi"), `idle(${newName}).count`)
    .replace(new RegExp(`busy\\(${esc(oldName)}\\)\\.count`, "gi"), `busy(${newName}).count`)
    .replace(new RegExp(`attr\\(${esc(oldName)}\\s*,`, "gi"), `attr(${newName},`);
}

/**
 * @param {any} effect
 * @param {string} macroName
 * @param {number} argIndex
 * @param {string} oldName
 * @param {string} newName
 */
function replaceMacroArg(effect, macroName, argIndex, oldName, newName) {
  if (typeof effect !== "string" || !oldName || !newName) return effect;
  const match = effect.match(/^([A-Z_]+)\((.*)\)$/i);
  if (!match || match[1].toUpperCase() !== macroName.toUpperCase()) return effect;
  const args = match[2].split(",").map((/** @type {string} */ part) => part.trim());
  if (argIndex >= args.length) return effect;
  if (norm(args[argIndex]) !== norm(oldName)) return effect;
  args[argIndex] = newName;
  return `${match[1]}(${args.join(", ")})`;
}

/**
 * @param {any} effect
 * @param {string} macroName
 * @param {number} startIndex
 * @param {string} oldName
 * @param {string} newName
 */
function replaceMacroArgsFrom(effect, macroName, startIndex, oldName, newName) {
  if (typeof effect !== "string" || !oldName || !newName) return effect;
  const match = effect.match(/^([A-Z_]+)\((.*)\)$/i);
  if (!match || match[1].toUpperCase() !== macroName.toUpperCase()) return effect;
  const args = match[2].split(",").map((/** @type {string} */ part) => part.trim());
  let changed = false;
  for (let i = startIndex; i < args.length; i++) {
    if (norm(args[i]) === norm(oldName)) {
      args[i] = newName;
      changed = true;
    }
  }
  if (!changed) return effect;
  return `${match[1]}(${args.join(", ")})`;
}

/**
 * @param {any} rawEffect
 * @param {(effect: any) => any} mapper
 */
function mapEffects(rawEffect, mapper) {
  const effects = Array.isArray(rawEffect) ? rawEffect : (rawEffect ? [rawEffect] : []);
  const next = effects.map(mapper);
  if (Array.isArray(rawEffect)) return next;
  if (rawEffect == null) return rawEffect;
  return next[0] || "";
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldName
 * @param {string} newName
 */
export function renameQueue(model, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return model;

  return {
    ...model,
    bEvents: (model.bEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      effect: mapEffects(event.effect, (/** @type {any} */ effect) => {
        let next = replaceMacroArg(effect, "ARRIVE", 1, oldName, newName);
        next = replaceMacroArg(next, "RELEASE", 1, oldName, newName);
        next = replaceMacroArg(next, "UNBATCH", 0, oldName, newName);
        next = replaceMacroArg(next, "SPLIT", 2, oldName, newName);
        next = replaceMacroArg(next, "BATCH", 0, oldName, newName);
        return next;
      }),
      routing: (event.routing || []).map((/** @type {any} */ route) => ({
        ...route,
        queueName: norm(route.queueName) === norm(oldName) ? newName : route.queueName,
      })),
      probabilisticRouting: (event.probabilisticRouting || []).map((/** @type {any} */ route) => ({
        ...route,
        queueName: norm(route.queueName) === norm(oldName) ? newName : route.queueName,
      })),
      defaultQueueName: norm(event.defaultQueueName) === norm(oldName) ? newName : event.defaultQueueName,
    })),
    cEvents: (model.cEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      condition: mapConditionVariables(event.condition, (/** @type {any} */ variable) => replaceQueueToken(variable, oldName, newName)),
      effect: (() => {
        let next = replaceQueueToken(event.effect, oldName, newName);
        next = replaceMacroArg(next, "ASSIGN", 0, oldName, newName);
        next = replaceMacroArg(next, "BATCH", 0, oldName, newName);
        return next;
      })(),
    })),
    queues: (model.queues || []).map((/** @type {any} */ queue) => ({
      ...queue,
      overflowDestination: norm(queue.overflowDestination) === norm(oldName) ? newName : queue.overflowDestination,
    })),
  };
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldName
 * @param {string} newName
 * @param {string} [role]
 */
export function renameEntityType(model, oldName, newName, role = "customer") {
  if (!oldName || !newName || oldName === newName) return model;

  const hasQueueNamedOld = (model.queues || []).some((/** @type {any} */ queue) => norm(queue.name) === norm(oldName));
  const shouldTreatAsTypeQueueToken = !hasQueueNamedOld;

  const updateCustomerCondition = (/** @type {any} */ condition) => (
    shouldTreatAsTypeQueueToken
      ? replaceQueueToken(condition, oldName, newName)
      : condition
  );

  const updateCustomerAssign = (/** @type {any} */ effect) => (
    shouldTreatAsTypeQueueToken
      ? replaceMacroArg(effect, "ASSIGN", 0, oldName, newName)
      : effect
  );

  return {
    ...model,
    bEvents: (model.bEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      effect: mapEffects(event.effect, (/** @type {any} */ effect) => {
        let next = effect;
        if (role === "customer") {
          next = replaceMacroArg(next, "ARRIVE", 0, oldName, newName);
          next = replaceMacroArg(next, "RENEGE_OLDEST", 0, oldName, newName);
          next = replaceMacroArg(next, "SPLIT", 0, oldName, newName);
        }
        if (role === "server") {
          next = replaceMacroArg(next, "RELEASE", 0, oldName, newName);
          next = replaceMacroArg(next, "PREEMPT", 0, oldName, newName);
          next = replaceMacroArg(next, "FAIL", 0, oldName, newName);
          next = replaceMacroArg(next, "REPAIR", 0, oldName, newName);
        }
        return next;
      }),
      routing: (event.routing || []).map((/** @type {any} */ route) => ({
        ...route,
        condition: mapConditionVariables(route.condition, (/** @type {any} */ variable) => {
          let next = variable;
          if (role === "customer") next = updateCustomerCondition(next);
          if (role === "server") next = replaceServerTokens(next, oldName, newName);
          return next;
        }),
      })),
    })),
    cEvents: (model.cEvents || []).map((/** @type {any} */ event) => {
      let nextCondition = event.condition || "";
      let nextEffect = event.effect || "";
      if (role === "customer") {
        nextCondition = mapConditionVariables(nextCondition, (/** @type {any} */ variable) => updateCustomerCondition(variable));
        nextEffect = updateCustomerAssign(nextEffect);
        nextEffect = replaceMacroArg(nextEffect, "MATCH", 0, oldName, newName);
        nextEffect = replaceMacroArg(nextEffect, "MATCH", 2, oldName, newName);
      }
      if (role === "server") {
        nextCondition = mapConditionVariables(nextCondition, (/** @type {any} */ variable) => replaceServerTokens(variable, oldName, newName));
        nextEffect = replaceMacroArg(nextEffect, "ASSIGN", 1, oldName, newName);
        nextEffect = replaceMacroArgsFrom(nextEffect, "COSEIZE", 1, oldName, newName);
      }
      return {
        ...event,
        condition: nextCondition,
        effect: nextEffect,
      };
    }),
    queues: (model.queues || []).map((/** @type {any} */ queue) => ({
      ...queue,
      customerType: role === "customer" && norm(queue.customerType) === norm(oldName) ? newName : queue.customerType,
      balkCondition: mapConditionVariables(queue.balkCondition, (/** @type {any} */ variable) => {
        let next = variable;
        if (role === "customer") next = updateCustomerCondition(next);
        if (role === "server") next = replaceServerTokens(next, oldName, newName);
        return next;
      }),
    })),
  };
}

/**
 * @param {any} [text]
 * @param {string} oldName
 * @param {string} newName
 */
function replaceStateToken(text = "", oldName = "", newName = "") {
  if (!oldName || !newName) return text;
  const sOld = esc(oldName);
  return String(text || "")
    .replace(new RegExp(`state\\.${sOld}\\b`, "gi"), `state.${newName}`)
    .replace(new RegExp(`\\b${sOld}\\b`, "gi"), newName);
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldName
 * @param {string} newName
 */
export function renameStateVariable(model, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return model;
  const matchStateVar = (/** @type {any} */ variable) => {
    if (!variable) return variable;
    if (variable.toLowerCase() === `state.${oldName}`.toLowerCase()) return `state.${newName}`;
    if (variable.toLowerCase() === oldName.toLowerCase()) return newName;
    return variable;
  };

  return {
    ...model,
    bEvents: (model.bEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      effect: mapEffects(event.effect, (/** @type {any} */ effect) => {
        let next = replaceMacroArg(effect, "SET", 0, oldName, newName);
        return next;
      }),
    })),
    cEvents: (model.cEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      condition: mapConditionVariables(event.condition, matchStateVar),
      effect: (() => {
        let next = replaceMacroArg(event.effect, "SET", 0, oldName, newName);
        return next;
      })(),
    })),
    entityTypes: (model.entityTypes || []).map((/** @type {any} */ et) => ({
      ...et,
      shiftSchedule: Array.isArray(et.shiftSchedule)
        ? et.shiftSchedule.map((/** @type {any} */ step) => {
            if (!step.when) return step;
            const w = { ...step.when };
            if (w.variable && w.variable.toLowerCase() === `state.${oldName}`.toLowerCase()) {
              w.variable = `state.${newName}`;
            }
            return { ...step, when: w };
          })
        : et.shiftSchedule,
    })),
  };
}

/**
 * @param {any} [text]
 * @param {string} oldId
 * @param {string} newId
 */
function replaceContainerToken(text = "", oldId = "", newId = "") {
  if (!oldId || !newId) return text;
  const sOld = esc(oldId);
  return String(text || "")
    .replace(new RegExp(`container\\(${sOld}\\)\\.(level|capacity|min|max)`, "gi"), (/** @type {string} */ m, /** @type {string} */ prop) => `container(${newId}).${prop}`);
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldId
 * @param {string} newId
 */
export function renameContainer(model, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return model;
  const matchContainer = (/** @type {any} */ variable) => {
    if (!variable) return variable;
    return variable.replace(
      new RegExp(`^container\\(${esc(oldId)}\\)\\.(level|capacity|min|max)$`, "i"),
      `container(${newId}).$1`
    );
  };

  return {
    ...model,
    bEvents: (model.bEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      effect: mapEffects(event.effect, (/** @type {any} */ effect) => {
        let next = replaceMacroArg(effect, "FILL", 0, oldId, newId);
        next = replaceMacroArg(next, "DRAIN", 0, oldId, newId);
        return next;
      }),
      routing: (event.routing || []).map((/** @type {any} */ route) => ({
        ...route,
        condition: mapConditionVariables(route.condition, matchContainer),
      })),
    })),
    cEvents: (model.cEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      condition: mapConditionVariables(event.condition, matchContainer),
      effect: (() => {
        let next = replaceMacroArg(event.effect, "FILL", 0, oldId, newId);
        next = replaceMacroArg(next, "DRAIN", 0, oldId, newId);
        return next;
      })(),
    })),
    queues: (model.queues || []).map((/** @type {any} */ queue) => ({
      ...queue,
      balkCondition: mapConditionVariables(queue.balkCondition, matchContainer),
    })),
    goals: (model.goals || []).map((/** @type {any} */ g) => {
      if (g.scope && g.scope.type === "container" && norm(g.scope.id) === norm(oldId)) {
        return { ...g, scope: { ...g.scope, id: newId } };
      }
      return g;
    }),
  };
}
