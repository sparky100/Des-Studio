"""
simmodlr results export validator.
Load a JSON results export file and cross-check UI-displayed numbers against raw data.

Usage:
    python analysis.py <path-to-results.json>
"""

import sys
# Force UTF-8 on Windows terminals
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import json
from pathlib import Path
from math import sqrt, isclose
from collections import defaultdict

# ── helpers ──────────────────────────────────────────────────────────────────

def load(path):
    with Path(path).open(encoding="utf-8") as f:
        return json.load(f)

def fin(v):
    """Coerce to float, return None if not finite."""
    try:
        f = float(v)
        return f if abs(f) != float('inf') else None
    except (TypeError, ValueError):
        return None

def ci95(values):
    """Compute 95% confidence interval (same logic as engine statistics.js)."""
    n = len(values)
    if n < 2:
        return {"n": n, "mean": values[0] if n else None, "lower": None, "upper": None, "halfWidth": None}
    mean = sum(values) / n
    if n == 2:
        half = abs(values[0] - values[1]) * 0.5
        return {"n": n, "mean": mean, "lower": mean - half, "upper": mean + half, "halfWidth": half}
    variance = sum((v - mean) ** 2 for v in values) / (n - 1)
    stddev = sqrt(variance)
    # t-values for 95% CI, df = n-1. For df > 30 use z = 1.96.
    T_TABLE = {1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,
               10:2.228,11:2.201,12:2.179,13:2.160,14:2.145,15:2.131,16:2.120,17:2.110,
               18:2.101,19:2.093,20:2.086,21:2.080,22:2.074,23:2.069,24:2.064,25:2.060,
               26:2.056,27:2.052,28:2.048,29:2.045,30:2.042}
    t = T_TABLE.get(n - 1, 1.96)
    half = t * stddev / sqrt(n)
    return {"n": n, "mean": mean, "lower": mean - half, "upper": mean + half, "halfWidth": half}

def fmt(v, d=2):
    if v is None:
        return "N/A"
    return f"{v:,.{d}f}"

# ── main analysis ────────────────────────────────────────────────────────────

def analyze(path):
    data = load(path)
    print("=" * 70)
    print("  simmodlr RESULTS EXPORT VALIDATOR")
    print("=" * 70)

    schema = data.get("schema", "unknown")
    print(f"\nSchema:     {schema}")
    print(f"Exported:   {data.get('exportedAt', 'N/A')}")
    print(f"Status:     {data.get('status', 'N/A')}")
    print(f"MetricsOnly:{data.get('metricsOnly', False)}")

    # ── experiment config ────────────────────────────────────────────────────
    exp = data.get("experiment", data.get("_experiment_config", {}))
    summary = data.get("results", {}).get("summary", data.get("summary", {}))
    runLabel = data.get("runLabel") or exp.get("runLabel", "N/A")
    seed = data.get("_base_seed") or exp.get("seed", "N/A")
    reps_config = exp.get("replications", len(data.get("replications", [])))
    print(f"\n{'=' * 70}")
    print("  EXPERIMENT CONFIG")
    print(f"{'=' * 70}")
    print(f"  Run Label:       {runLabel}")
    print(f"  Seed:            {seed}")
    print(f"  Replications:    {reps_config}")
    print(f"  Warm-up:         {exp.get('warmupPeriod', 0)}")
    print(f"  Max sim time:    {exp.get('maxSimTime', summary.get('finalTime') or exp.get('max_simulation_time') or 'N/A')}")
    print(f"  Term. mode:      {exp.get('terminationMode', 'time')}")

    # ── aggregate stats ──────────────────────────────────────────────────────
    agg = data.get("aggregateStats", {})
    if agg:
        print(f"\nAGGREGATE CI STATS")
        for metric, ci in agg.items():
            mean = fin(ci.get("mean"))
            lower = fin(ci.get("lower"))
            upper = fin(ci.get("upper"))
            n = ci.get("n", 0)
            hw = fin(ci.get("halfWidth"))
            print(f"  {metric:30s}  mean={fmt(mean)}  [{fmt(lower)} – {fmt(upper)}]  n={n}  ±{fmt(hw)}")

    # ── per-replication summary ──────────────────────────────────────────────
    reps = data.get("replications", [])
    if reps:
        print(f"\n── Per-Replication Summary ({len(reps)} reps) ──")
        print(f"  {'Idx':>4} {'Seed':>10} {'Arrived':>8} {'Served':>8} {'Reneged':>8} {'Rate%':>7} {'AvgWait':>8} {'AvgSvc':>8} {'Sojourn':>8} {'Cost':>8}")
        print(f"  {'─'*4} {'─'*10} {'─'*8} {'─'*8} {'─'*8} {'─'*7} {'─'*8} {'─'*8} {'─'*8} {'─'*8}")
        arrival_vals = []
        wait_vals = []
        svc_vals = []
        sojourn_vals = []
        served_vals = []
        for r in reps:
            s = r.get("summary", {})
            idx = r.get("replicationIndex", "?")
            seed = r.get("seed", "?")
            total = fin(s.get("total", s.get("arrived", 0)))
            served = fin(s.get("served", 0))
            reneged = fin(s.get("reneged", 0))
            ratio = served / total * 100 if total and total > 0 else 0
            avgW = fin(s.get("avgWait", 0))
            avgS = fin(s.get("avgSvc", 0))
            avgSoj = fin(s.get("avgSojourn", 0))
            cost = fin(s.get("totalCost", 0))
            print(f"  {idx:>4} {seed:>10} {total:>8.0f} {served:>8.0f} {reneged:>8.0f} {ratio:>6.1f}% {fmt(avgW):>8} {fmt(avgS):>8} {fmt(avgSoj):>8} {fmt(cost,0):>8}")
            if avgW is not None:
                wait_vals.append(avgW)
            if avgS is not None:
                svc_vals.append(avgS)
            if avgSoj is not None:
                sojourn_vals.append(avgSoj)
            if total is not None:
                arrival_vals.append(total)
            if served is not None:
                served_vals.append(served)

        if wait_vals and len(wait_vals) > 1:
            print(f"\n  Cross-check CI from raw replication data:")
            for name, vals in [("AvgWait", wait_vals), ("AvgSvc", svc_vals), ("Sojourn", sojourn_vals)]:
                if vals:
                    ci = ci95(vals)
                    stored = agg.get(f"summary.{name[0].lower() + name[1:]}" if name != "AvgSvc" else "summary.avgSvc") or agg.get(f"summary.{name.lower()}")
                    stored_mean = fin(stored.get("mean")) if stored else None
                    match = "✓" if stored_mean is not None and isclose(ci["mean"], stored_mean, rel_tol=0.01) else "✗"
                    print(f"    {name:12s} computed={fmt(ci['mean'])}  stored={fmt(stored_mean)}  {match}")

    # ── summary section ──────────────────────────────────────────────────────
    if summary:
        print(f"\n── Results Summary ──")
        for k in ["total", "arrived", "served", "reneged", "servedRatio",
                   "avgWait", "avgSvc", "avgSojourn", "avgTimeInSystem",
                   "totalCost", "costPerServed"]:
            v = summary.get(k)
            if v is not None:
                label = k.replace("total", "Arrived").replace("arrived", "Arrived")
                print(f"  {label:20s}: {fmt(v)}")

        # per-queue
        perQueue = summary.get("perQueue", {})
        if perQueue:
            print(f"\n  ── Per-Queue ──")
            for qname, qdata in perQueue.items():
                print(f"    {qname}:")
                for qk, qv in qdata.items():
                    print(f"      {qk}: {fmt(qv)}")

        # per-resource
        perRes = summary.get("perResource", {})
        if perRes:
            print(f"\n  ── Per-Resource ──")
            for rname, rdata in perRes.items():
                print(f"    {rname}:")
                for rk, rv in rdata.items():
                    print(f"      {rk}: {fmt(rv)}")

        # sections
        sections = summary.get("sections", {})
        if sections:
            print(f"\n  ── Per-Section ──")
            for sec_id, sdata in sections.items():
                print(f"    {sec_id}: count={fmt(sdata.get('count',0),0)}  avgSojourn={fmt(sdata.get('avgSojourn'))}")

    # ── time series statistics ───────────────────────────────────────────────
    ts = data.get("results", {}).get("timeSeries", [])
    if ts:
        print(f"\n── Time Series ({len(ts)} snapshots) ──")
        # collect all queue names and server types
        queue_names = set()
        server_names = set()
        for snap in ts:
            byQ = snap.get("byQueue", {})
            byT = snap.get("byType", {})
            queue_names.update(byQ.keys())
            server_names.update(k for k, v in byT.items() if "busy" in v or "total" in v)
        if queue_names:
            print(f"  Queues tracked: {', '.join(sorted(queue_names))}")
        if server_names:
            print(f"  Servers tracked: {', '.join(sorted(server_names))}")

        # peak queue depth per queue
        if queue_names:
            peaks = {q: max((s.get("byQueue", {}).get(q, {}).get("waiting", 0) or 0) for s in ts) for q in queue_names}
            print(f"\n  Peak queue depths:")
            for q, peak in sorted(peaks.items()):
                print(f"    {q}: {peak}")

        # average server utilisation
        if server_names:
            print(f"\n  Average server utilisation:")
            for sv in sorted(server_names):
                utils = []
                for s in ts:
                    b = s.get("byType", {}).get(sv, {}).get("busy")
                    t = s.get("byType", {}).get(sv, {}).get("total") or 1
                    if b is not None and t > 0:
                        utils.append((b / t) * 100)
                avg_u = sum(utils) / len(utils) if utils else 0
                peak_u = max(utils) if utils else 0
                print(f"    {sv}: avg={avg_u:.1f}%  peak={peak_u:.1f}%")

    # ── wait distributions ───────────────────────────────────────────────────
    waitDist = data.get("results", {}).get("waitDist", {})
    if waitDist:
        print(f"\n── Wait Distributions ──")
        for qname, dist in waitDist.items():
            n = dist.get("n", 0)
            mean = fin(dist.get("mean"))
            p50 = fin(dist.get("p50"))
            p95 = fin(dist.get("p95"))
            p99 = fin(dist.get("p99"))
            values = dist.get("values", [])
            print(f"  {qname}: n={n}  mean={fmt(mean)}  p50={fmt(p50)}  p95={fmt(p95)}  p99={fmt(p99)}  samples={len(values)}")

    # ── runtime metrics ──────────────────────────────────────────────────────
    rt = data.get("results", {}).get("runtimeMetrics", {})
    if rt:
        print(f"\n── Runtime Metrics ──")
        for k, v in rt.items():
            print(f"  {k}: {v}")

    # ── validation summary ───────────────────────────────────────────────────
    print(f"\n── Quick Cross-Checks ──")
    arrived = fin(summary.get("total", summary.get("arrived", 0))) or 0
    served = fin(summary.get("served", 0)) or 0
    reneged = fin(summary.get("reneged", 0)) or 0
    servedRatio = fin(summary.get("servedRatio")) or 0

    if arrived > 0:
        print(f"  Served + Reneged = Arrived?  {served:.0f} + {reneged:.0f} = {served+reneged:.0f} vs {arrived:.0f}  {'✓' if isclose(served+reneged, arrived, abs_tol=1) else '✗ (expected if in-progress)'}")
        print(f"  Served / Arrived       = {served/arrived*100:.1f}%  (stored: {servedRatio*100:.1f}%)  {'✓' if isclose(served/arrived, servedRatio, abs_tol=0.01) else '✗'}")

    # Little's Law check
    avgWait = fin(summary.get("avgWait")) or 0
    avgWIP = fin(summary.get("avgWIP"))
    arrivalRate = arrived / fin(exp.get("maxSimTime", 1)) if fin(exp.get("maxSimTime")) else None
    if avgWIP is not None and arrivalRate is not None:
        littleWait = avgWIP / arrivalRate
        print(f"  Little's Law: avgWIP/arrivalRate = {fmt(littleWait)}  vs avgWait = {fmt(avgWait)}  {'✓' if isclose(littleWait, avgWait, rel_tol=0.1) else '✗'}")

    print(f"\n{'=' * 70}")
    print("  Analysis complete.")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analysis.py <path-to-results-export.json>")
        sys.exit(1)
    analyze(sys.argv[1])
