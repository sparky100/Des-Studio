// engine/queue-refs.js — model reference propagation for queue and entity-type renames
import { mapConditionVariables } from "../model/conditionFormat.js";

function norm(value = "") {
  return String(value || "").trim().toLowerCase();
}

function esc(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceQueueToken(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  return String(text || "").replace(
    new RegExp(`queue\\(${esc(oldName)}\\)`, "gi"),
    `queue(${newName})`
  );
}

function replaceServerTokens(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  return String(text || "")
    .replace(new RegExp(`idle\\(${esc(oldName)}\\)\\.count`, "gi"), `idle(${newName}).count`)
    .replace(new RegExp(`busy\\(${esc(oldName)}\\)\\.count`, "gi"), `busy(${newName}).count`)
    .replace(new RegExp(`attr\\(${esc(oldName)}\\s*,`, "gi"), `attr(${newName},`);
}

function replaceMacroArg(effect, macroName, argIndex, oldName, newName) {
  if (typeof effect !== "string" || !oldName || !newName) return effect;
  const match = effect.match(/^([A-Z_]+)\((.*)\)$/i);
  if (!match || match[1].toUpperCase() !== macroName.toUpperCase()) return effect;
  const args = match[2].split(",").map(part => part.trim());
  if (argIndex >= args.length) return effect;
  if (norm(args[argIndex]) !== norm(oldName)) return effect;
  args[argIndex] = newName;
  return `${match[1]}(${args.join(", ")})`;
}

function mapEffects(rawEffect, mapper) {
  const effects = Array.isArray(rawEffect) ? rawEffect : (rawEffect ? [rawEffect] : []);
  const next = effects.map(mapper);
  if (Array.isArray(rawEffect)) return next;
  if (rawEffect == null) return rawEffect;
  return next[0] || "";
}

export function renameQueue(model, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return model;

  return {
    ...model,
    bEvents: (model.bEvents || []).map(event => ({
      ...event,
      effect: mapEffects(event.effect, effect => {
        let next = replaceMacroArg(effect, "ARRIVE", 1, oldName, newName);
        next = replaceMacroArg(next, "RELEASE", 1, oldName, newName);
        next = replaceMacroArg(next, "UNBATCH", 0, oldName, newName);
        return next;
      }),
      routing: (event.routing || []).map(route => ({
        ...route,
        queueName: norm(route.queueName) === norm(oldName) ? newName : route.queueName,
      })),
      probabilisticRouting: (event.probabilisticRouting || []).map(route => ({
        ...route,
        queueName: norm(route.queueName) === norm(oldName) ? newName : route.queueName,
      })),
      defaultQueueName: norm(event.defaultQueueName) === norm(oldName) ? newName : event.defaultQueueName,
    })),
    cEvents: (model.cEvents || []).map(event => ({
      ...event,
      condition: mapConditionVariables(event.condition, variable => replaceQueueToken(variable, oldName, newName)),
      effect: (() => {
        let next = replaceQueueToken(event.effect, oldName, newName);
        next = replaceMacroArg(next, "ASSIGN", 0, oldName, newName);
        next = replaceMacroArg(next, "BATCH", 0, oldName, newName);
        return next;
      })(),
    })),
    queues: (model.queues || []).map(queue => ({
      ...queue,
      overflowDestination: norm(queue.overflowDestination) === norm(oldName) ? newName : queue.overflowDestination,
    })),
  };
}

export function renameEntityType(model, oldName, newName, role = "customer") {
  if (!oldName || !newName || oldName === newName) return model;

  const hasQueueNamedOld = (model.queues || []).some(queue => norm(queue.name) === norm(oldName));
  const shouldTreatAsTypeQueueToken = !hasQueueNamedOld;

  const updateCustomerCondition = condition => (
    shouldTreatAsTypeQueueToken
      ? replaceQueueToken(condition, oldName, newName)
      : condition
  );

  const updateCustomerAssign = effect => (
    shouldTreatAsTypeQueueToken
      ? replaceMacroArg(effect, "ASSIGN", 0, oldName, newName)
      : effect
  );

  return {
    ...model,
    queues: (model.queues || []).map(queue => ({
      ...queue,
      customerType: role === "customer" && norm(queue.customerType) === norm(oldName) ? newName : queue.customerType,
    })),
    bEvents: (model.bEvents || []).map(event => ({
      ...event,
      effect: mapEffects(event.effect, effect => {
        let next = effect;
        if (role === "customer") {
          next = replaceMacroArg(next, "ARRIVE", 0, oldName, newName);
          next = replaceMacroArg(next, "RENEGE_OLDEST", 0, oldName, newName);
        }
        if (role === "server") {
          next = replaceMacroArg(next, "RELEASE", 0, oldName, newName);
        }
        return next;
      }),
    })),
    cEvents: (model.cEvents || []).map(event => {
      let nextCondition = event.condition || "";
      let nextEffect = event.effect || "";
      if (role === "customer") {
        nextCondition = mapConditionVariables(nextCondition, variable => updateCustomerCondition(variable));
        nextEffect = updateCustomerAssign(nextEffect);
      }
      if (role === "server") {
        nextCondition = mapConditionVariables(nextCondition, variable => replaceServerTokens(variable, oldName, newName));
        nextEffect = replaceMacroArg(nextEffect, "ASSIGN", 1, oldName, newName);
      }
      return {
        ...event,
        condition: nextCondition,
        effect: nextEffect,
      };
    }),
  };
}
