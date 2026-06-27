// ui/shared/DistHelp.js — Distribution family groupings and contextual help text

export const DIST_GROUPS = [
  {
    id: "parametric",
    label: "Parametric",
    dists: ["Fixed", "Exponential", "Uniform", "Normal", "Triangular", "Erlang", "Lognormal"],
  },
  {
    id: "timevarying",
    label: "Time-varying",
    dists: ["Piecewise", "Schedule"],
  },
  {
    id: "fromdata",
    label: "From data",
    dists: ["Empirical", "ServerAttr", "EntityAttr"],
  },
];

export const DIST_HELP = {
  Fixed: {
    summary: "Constant value. Use when the duration is always the same.",
    params: {
      value: "The exact value returned every time. Must be ≥ 0.",
    },
  },
  Exponential: {
    summary: "Memoryless inter-arrival or service time. Use when events occur randomly with no pattern.",
    params: {
      mean: "Average time between events. Rate = 1/mean. Must be > 0.",
    },
  },
  Uniform: {
    summary: "Equal probability across a range. Use when any value between min and max is equally likely.",
    params: {
      min: "Minimum value (inclusive). Must be < max.",
      max: "Maximum value (inclusive). Must be > min.",
    },
  },
  Normal: {
    summary: "Bell-shaped. Use when values cluster around a mean with symmetric variation.",
    params: {
      mean: "Centre of the distribution. Values are clipped at 0 if negative.",
      stddev: "Spread around the mean. Keep stddev < mean/2 to avoid many negative samples being clipped.",
    },
  },
  Triangular: {
    summary: "Three-point estimate: pessimistic, most likely, optimistic. Use for expert estimates when data is scarce.",
    params: {
      min:  "Minimum possible value (must be ≤ mode).",
      mode: "Most likely value (must be between min and max).",
      max:  "Maximum possible value (must be ≥ mode).",
    },
  },
  Erlang: {
    summary: "Sum of k exponential stages. More regular than Exponential. Use for multi-phase service times.",
    params: {
      k:    "Number of phases (positive integer). Higher k = narrower distribution.",
      mean: "Overall mean duration across all k phases. Must be > 0.",
    },
  },
  Lognormal: {
    summary: "Right-skewed, naturally positive (exp of a Normal). Use for service/repair times that have a long tail of unusually slow cases.",
    params: {
      logMean:    "Mean of the underlying Normal in log-space. Sampled value = exp(logMean + logStdDev × z).",
      logStdDev:  "Spread of the underlying Normal in log-space. Must be > 0; larger values produce a longer right tail.",
    },
  },
  Empirical: {
    summary: "Draw directly from your own data. Import a CSV column of numeric values.",
    params: {},
  },
  Piecewise: {
    summary: "Time-varying rate — different distributions in different time windows of the simulation.",
    params: {},
  },
  Schedule: {
    summary: "Planned arrival times from a timetable. Use for buses, trains, or known appointment slots.",
    params: {},
  },
  ServerAttr: {
    summary: "Read a named attribute from the matched server entity at runtime.",
    params: {
      attr: "Name of the server attribute to use as the sampled value.",
    },
  },
  EntityAttr: {
    summary: "Read a named attribute from the arriving customer entity at runtime.",
    params: {
      attr: "Name of the entity attribute to use as the sampled value.",
    },
  },
};

// Returns the group for a given distribution name, or null
export function getDistGroup(distName) {
  return DIST_GROUPS.find(g => g.dists.includes(distName)) || null;
}

// Validate parameters for a distribution; returns array of { param, message } errors
export function validateDistParams(dist, params = {}) {
  const errs = [];
  const p = k => parseFloat(params[k]);
  switch (dist) {
    case "Fixed":
      if (params.value !== "" && params.value != null && isNaN(p("value")))
        errs.push({ param: "value", message: "Must be a number" });
      break;
    case "Exponential":
      if (params.mean !== "" && params.mean != null && !(p("mean") > 0))
        errs.push({ param: "mean", message: "Must be > 0" });
      break;
    case "Uniform":
      if (params.min !== "" && params.max !== "" && params.min != null && params.max != null) {
        if (!(p("min") < p("max")))
          errs.push({ param: "max", message: "max must be > min" });
      }
      break;
    case "Normal":
      if (params.stddev !== "" && params.stddev != null && !(p("stddev") > 0))
        errs.push({ param: "stddev", message: "Must be > 0" });
      break;
    case "Triangular": {
      const a = p("min"), c = p("mode"), b = p("max");
      if (!isNaN(a) && !isNaN(c) && !(a <= c))
        errs.push({ param: "mode", message: "mode must be ≥ min" });
      if (!isNaN(c) && !isNaN(b) && !(c <= b))
        errs.push({ param: "max", message: "max must be ≥ mode" });
      break;
    }
    case "Erlang":
      if (params.k !== "" && params.k != null) {
        const k = parseFloat(params.k);
        if (!(k >= 1) || k !== Math.round(k))
          errs.push({ param: "k", message: "Must be a positive integer" });
      }
      if (params.mean !== "" && params.mean != null && !(p("mean") > 0))
        errs.push({ param: "mean", message: "Must be > 0" });
      break;
    case "Lognormal":
      if (params.logStdDev !== "" && params.logStdDev != null && !(p("logStdDev") > 0))
        errs.push({ param: "logStdDev", message: "Must be > 0" });
      break;
    default:
      break;
  }
  return errs;
}
