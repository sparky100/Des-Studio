// engine/distribution-fitting.js — Parse CSV, infer column types, fit distributions
// Pure JavaScript. No React. No DOM. No external dependencies.

/**
 * Parse RFC-4180-ish CSV text into rows.
 * Handles quoted fields and commas inside quotes.
 * Returns { headers: string[], rows: string[][] }
 */
export function parseCsv(text) {
  if (!text || typeof text !== "string") {
    return { headers: [], rows: [] };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { headers: [], rows: [] };
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const parseLine = (line) => {
    const fields = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i++; // skip double quote
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(field.trim());
          field = "";
        } else {
          field += ch;
        }
      }
    }
    fields.push(field.trim());
    return fields;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter(r => r.length > 0 && r.some(c => c !== ""));
  return { headers, rows };
}

function isNumeric(v) {
  return v !== "" && !isNaN(parseFloat(v)) && isFinite(v);
}

function isBoolean(v) {
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "false" || s === "1" || s === "0" || s === "yes" || s === "no";
}

/**
 * Infer valueType for a single column's values.
 * Priority: boolean > number > string
 */
function inferType(values) {
  if (values.every(isBoolean)) return "boolean";
  if (values.every(isNumeric)) return "number";
  return "string";
}

function toNumber(v) {
  return parseFloat(v);
}

function computeMoments(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const skewness = n > 2
    ? values.reduce((sum, v) => sum + ((v - mean) / stdDev) ** 3, 0) / n
    : 0;
  const kurtosis = n > 2 && variance > 0
    ? values.reduce((sum, v) => sum + ((v - mean) / stdDev) ** 4, 0) / n
    : 3;
  return { mean, variance, stdDev, min, max, skewness, kurtosis, count: n };
}

function sorted(values) {
  return values.slice().sort((a, b) => a - b);
}

/**
 * Empirical CDF at point x for sorted values.
 */
function empiricalCdf(sortedValues, x) {
  let count = 0;
  for (const v of sortedValues) {
    if (v <= x) count++;
    else break;
  }
  return count / sortedValues.length;
}

/**
 * Compute max absolute difference between empirical and theoretical CDF
 * at sample quantile points.
 */
function ksStatistic(sortedValues, theoreticalCdf) {
  const n = sortedValues.length;
  if (n === 0) return Infinity;
  let maxDiff = 0;
  for (let i = 0; i < n; i++) {
    const x = sortedValues[i];
    const empiricalRight = (i + 1) / n;
    const empiricalLeft = i / n;
    const theoretical = theoreticalCdf(x);
    maxDiff = Math.max(
      maxDiff,
      Math.abs(empiricalRight - theoretical),
      Math.abs(empiricalLeft - theoretical)
    );
  }
  return maxDiff;
}

function fitFixed(values, stats) {
  if (stats.stdDev < 0.0001 * Math.abs(stats.mean) || stats.stdDev === 0) {
    return {
      type: "fixed",
      params: { value: String(round4(stats.mean)) },
      ks: 0,
    };
  }
  return null;
}

function fitExponential(values, stats) {
  if (stats.mean <= 0 || stats.min < 0) return null;
  const rate = 1 / stats.mean;
  const cdf = (x) => (x < 0 ? 0 : 1 - Math.exp(-rate * x));
  const ks = ksStatistic(sorted(values), cdf);
  const cv = stats.stdDev / stats.mean;
  // Exponential has CV = 1. Allow some tolerance.
  if (ks > 0.4 || cv < 0.5 || cv > 1.6) return null;
  return {
    type: "exponential",
    params: { mean: String(round4(stats.mean)) },
    ks,
  };
}

function fitUniform(values, stats) {
  const range = stats.max - stats.min;
  if (range <= 0) return null;
  const cdf = (x) => {
    if (x < stats.min) return 0;
    if (x > stats.max) return 1;
    return (x - stats.min) / range;
  };
  const ks = ksStatistic(sorted(values), cdf);
  // Uniform has mean = (min+max)/2, variance = (max-min)^2/12
  const expectedVar = range * range / 12;
  const varRatio = Math.abs(stats.variance - expectedVar) / (expectedVar || 1);
  if (ks > 0.35 || varRatio > 0.8) return null;
  return {
    type: "uniform",
    params: { min: String(round4(stats.min)), max: String(round4(stats.max)) },
    ks,
  };
}

function fitNormal(values, stats) {
  if (stats.stdDev <= 0) return null;
  const mean = stats.mean;
  const sd = stats.stdDev;
  // Approximate normal CDF using error function approximation
  const erf = (z) => {
    const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
    const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z);
    const t2 = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t2 + a4) * t2) + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-x * x);
    return sign * y;
  };
  const cdf = (x) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
  const ks = ksStatistic(sorted(values), cdf);
  // Normal: skewness near 0, kurtosis near 3
  if (ks > 0.35 || Math.abs(stats.skewness) > 1.2 || Math.abs(stats.kurtosis - 3) > 2.0) return null;
  return {
    type: "normal",
    params: { mean: String(round4(mean)), stdDev: String(round4(sd)) },
    ks,
  };
}

function fitLognormal(values, stats) {
  if (stats.min <= 0 || stats.stdDev <= 0) return null;
  const logVals = values.map(Math.log);
  const logMean = logVals.reduce((a, b) => a + b, 0) / logVals.length;
  const logVar = logVals.reduce((sum, v) => sum + (v - logMean) ** 2, 0) / logVals.length;
  const logSd = Math.sqrt(logVar);
  const erf = (z) => {
    const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
    const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z);
    const t2 = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t2 + a4) * t2) + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-x * x);
    return sign * y;
  };
  const cdf = (x) => {
    if (x <= 0) return 0;
    return 0.5 * (1 + erf((Math.log(x) - logMean) / (logSd * Math.SQRT2)));
  };
  const ks = ksStatistic(sorted(values), cdf);
  // Check if log-transformed looks normal
  const logSkew = logVals.reduce((sum, v) => sum + ((v - logMean) / logSd) ** 3, 0) / logVals.length;
  const logKurt = logVals.reduce((sum, v) => sum + ((v - logMean) / logSd) ** 4, 0) / logVals.length;
  if (ks > 0.35 || Math.abs(logSkew) > 1.2 || Math.abs(logKurt - 3) > 2.0) return null;
  return {
    type: "lognormal",
    params: { logMean: String(round4(logMean)), logStdDev: String(round4(logSd)) },
    ks,
  };
}

function fitTriangular(values, stats) {
  if (stats.min >= stats.max) return null;
  // Estimate mode as the most frequent value (rounded to 2 significant digits)
  const buckets = new Map();
  for (const v of values) {
    const k = Math.round(v * 100) / 100;
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  let mode = stats.mean;
  let maxCount = 0;
  for (const [k, count] of buckets) {
    if (count > maxCount) {
      maxCount = count;
      mode = k;
    }
  }
  // Clamp mode to [min, max]
  mode = Math.max(stats.min, Math.min(stats.max, mode));
  const cdf = (x) => {
    if (x <= stats.min) return 0;
    if (x >= stats.max) return 1;
    if (x <= mode) {
      return ((x - stats.min) ** 2) / ((stats.max - stats.min) * (mode - stats.min));
    }
    return 1 - ((stats.max - x) ** 2) / ((stats.max - stats.min) * (stats.max - mode));
  };
  const ks = ksStatistic(sorted(values), cdf);
  return {
    type: "triangular",
    params: {
      min: String(round4(stats.min)),
      mode: String(round4(mode)),
      max: String(round4(stats.max)),
    },
    ks,
  };
}

function fitEmpirical(values) {
  return {
    type: "empirical",
    params: { values: values.map(round4) },
    ks: 0, // empirical always fits itself
  };
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

/**
 * Fit the best distribution to a numeric array.
 * Returns { type, params, score } where lower score = better fit.
 */
export function fitDistribution(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { type: "fixed", params: { value: "0" }, score: Infinity };
  }
  const stats = computeMoments(values);
  const parametric = [
    fitFixed(values, stats),
    fitExponential(values, stats),
    fitNormal(values, stats),
    fitLognormal(values, stats),
    fitUniform(values, stats),
    fitTriangular(values, stats),
  ].filter(Boolean);

  // Sort parametric by KS
  parametric.sort((a, b) => a.ks - b.ks);

  // Use the best parametric fit if it's reasonable; otherwise empirical
  const bestParametric = parametric[0];
  const EMPIRICAL_THRESHOLD = 0.35; // generous threshold for heuristic fitting
  const best = bestParametric && bestParametric.ks <= EMPIRICAL_THRESHOLD
    ? bestParametric
    : fitEmpirical(values);
  return {
    type: best.type,
    params: best.params,
    score: best.ks,
    stats: {
      mean: round4(stats.mean),
      stdDev: round4(stats.stdDev),
      min: round4(stats.min),
      max: round4(stats.max),
      count: stats.count,
    },
  };
}

/**
 * Infer column metadata from parsed CSV rows.
 * Returns array of column descriptors.
 */
export function inferColumns(headers, rows) {
  if (!headers.length || !rows.length) return [];
  return headers.map((header, colIdx) => {
    const rawValues = rows.map(r => r[colIdx] ?? "").filter(v => v !== "");
    const valueType = inferType(rawValues);
    let distResult = null;
    if (valueType === "number" && rawValues.length > 0) {
      const nums = rawValues.map(toNumber);
      distResult = fitDistribution(nums);
    }
    return {
      name: header,
      valueType,
      sampleValues: rawValues.slice(0, 5),
      rowCount: rawValues.length,
      distResult,
    };
  });
}

/**
 * Generate an entity type definition from inferred columns.
 * The first numeric column (or first column overall) becomes the arrival/service attribute.
 * All columns become attrDefs.
 */
export function generateEntityType(name, columns) {
  const idSafe = name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "imported_entity";
  const attrDefs = columns.map((col, i) => {
    const attrId = `a_${col.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || i}`;
    const def = {
      id: attrId,
      name: col.name,
      valueType: col.valueType,
      defaultValue: col.valueType === "number" ? (col.distResult?.stats?.mean ?? (col.sampleValues?.length ? round4(col.sampleValues.map(toNumber).reduce((a, b) => a + b, 0) / col.sampleValues.length) : 0)) :
                    col.valueType === "boolean" ? false : "",
      mutable: true,
    };
    if (col.distResult && col.distResult.type !== "fixed" && col.distResult.type !== "empirical") {
      def.dist = col.distResult.type;
      def.distParams = { ...col.distResult.params };
    }
    return def;
  });
  return {
    id: `et_${idSafe}`,
    name: name,
    role: "customer",
    count: 0,
    attrDefs,
  };
}

/**
 * Convenience: parse CSV text, infer columns, and generate entity type.
 * Returns { entityType, columns } or throws on parse error.
 */
export function csvToEntityType(csvText, entityName = "Imported Entity") {
  const { headers, rows } = parseCsv(csvText);
  if (headers.length === 0) {
    throw new Error("CSV file is empty or has no headers.");
  }
  if (rows.length === 0) {
    throw new Error("CSV file has headers but no data rows.");
  }
  const columns = inferColumns(headers, rows);
  const entityType = generateEntityType(entityName, columns);
  return { entityType, columns };
}
