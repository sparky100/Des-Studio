// sweep-params.js — Enumerate sweepable model parameters and apply values
// No React, no DOM. Pure JS — can run in workers.

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function enumerateSweepableParams(model) {
  const params = [];

  // 1. Entity type count (excluding entity types with role="customer" and count=0)
  for (const et of (model.entityTypes || [])) {
    params.push({
      type: "entityTypeCount",
      targetId: et.id,
      label: `${et.name}.count`,
      description: `Number of ${et.name} servers`,
      currentValue: parseInt(et.count, 10) || 0,
      path: `entityTypes.${et.id}.count`,
    });
  }

  // 2. Queue capacity
  for (const q of (model.queues || [])) {
    params.push({
      type: "queueCapacity",
      targetId: q.id,
      label: `${q.name}.capacity`,
      description: `Capacity of ${q.name} queue`,
      currentValue: q.capacity === "" ? Infinity : parseInt(q.capacity, 10) || 0,
      path: `queues.${q.id}.capacity`,
    });
  }

  // 3. B-Event distribution parameters
  for (const b of (model.bEvents || [])) {
    for (const s of (b.schedules || [])) {
      if (!s.distParams) continue;
      for (const [paramKey, paramValue] of Object.entries(s.distParams)) {
        params.push({
          type: "bEventDistParam",
          targetId: b.id,
          parentLabel: b.name,
          paramKey,
          label: `${b.name}.${s.dist || "dist"}.${paramKey}`,
          description: `Distribution parameter '${paramKey}' of B-Event '${b.name}'`,
          currentValue: parseFloat(paramValue) || 0,
          path: `bEvents.${b.id}.schedules.distParams.${paramKey}`,
        });
      }
    }
  }

  // 4. C-Event distribution parameters
  for (const c of (model.cEvents || [])) {
    for (const s of (c.cSchedules || [])) {
      if (!s.distParams) continue;
      for (const [paramKey, paramValue] of Object.entries(s.distParams)) {
        params.push({
          type: "cEventDistParam",
          targetId: c.id,
          parentLabel: c.name,
          paramKey,
          label: `${c.name}.${s.dist || "dist"}.${paramKey}`,
          description: `Distribution parameter '${paramKey}' of C-Event '${c.name}'`,
          currentValue: parseFloat(paramValue) || 0,
          path: `cEvents.${c.id}.cSchedules.distParams.${paramKey}`,
        });
      }
    }
  }

  // 5. State variable initial values
  for (const sv of (model.stateVariables || [])) {
    params.push({
      type: "stateVarInit",
      targetId: sv.name,
      label: `${sv.name}.initialValue`,
      description: `Initial value of state variable '${sv.name}'`,
      currentValue: parseFloat(sv.initialValue) || 0,
      path: `stateVariables.${sv.name}.initialValue`,
    });
  }

  return params;
}

export function applySweepValue(model, paramConfig, value) {
  const clone = deepClone(model);

  switch (paramConfig.type) {
    case "entityTypeCount": {
      const et = (clone.entityTypes || []).find(e => e.id === paramConfig.targetId);
      if (et) et.count = String(Math.max(0, Math.round(value)));
      break;
    }
    case "queueCapacity": {
      const q = (clone.queues || []).find(q => q.id === paramConfig.targetId);
      if (q) {
        q.capacity = value === Infinity || value <= 0 ? "" : String(Math.round(value));
      }
      break;
    }
    case "bEventDistParam": {
      const b = (clone.bEvents || []).find(e => e.id === paramConfig.targetId);
      if (b) {
        for (const s of (b.schedules || [])) {
          if (s.distParams && paramConfig.paramKey in s.distParams) {
            s.distParams[paramConfig.paramKey] = String(Math.max(0.001, value));
          }
        }
      }
      break;
    }
    case "cEventDistParam": {
      const c = (clone.cEvents || []).find(e => e.id === paramConfig.targetId);
      if (c) {
        for (const s of (c.cSchedules || [])) {
          if (s.distParams && paramConfig.paramKey in s.distParams) {
            s.distParams[paramConfig.paramKey] = String(Math.max(0.001, value));
          }
        }
      }
      break;
    }
    case "stateVarInit": {
      const sv = (clone.stateVariables || []).find(s => s.name === paramConfig.targetId);
      if (sv) sv.initialValue = String(value);
      break;
    }
  }

  return clone;
}

export function generateSweepValues(min, max, step) {
  if (Math.abs(max - min) < 1e-9) return [min];
  const values = [];
  const nSteps = Math.floor((max - min) / step);
  for (let i = 0; i <= nSteps; i++) {
    values.push(+(min + i * step).toFixed(6));
  }
  // Cap at 50
  if (values.length > 50) {
    const everyN = Math.ceil(values.length / 50);
    return values.filter((_, i) => i % everyN === 0).slice(0, 50);
  }
  return values;
}
