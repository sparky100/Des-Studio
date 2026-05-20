# Sprint 67 — Plain-English UX & Results Clarity: Capability Guide

**Date:** 2026-05-19
**Status:** Planned

---

## Overview

Sprint 67 is a presentation and usability sprint. It does **not** remove advanced simulation capability. Instead, it changes how DES Studio explains that capability:

1. **Plain English first**
2. **Technical detail second**
3. **Outcome before method**
4. **User question before internal structure**

The target result is a tool that still works for expert modellers, but no longer makes specialist terms the first thing every user has to decode.

---

## What will change

### 1 — Run setup will explain decisions, not just settings

Current terminology such as `warm-up period`, `replications`, `seed`, and `termination mode` will be rewritten so that the first label explains the purpose of the setting.

Examples:

| Current | Planned |
|---------|---------|
| Warm-up period | Ignore early results |
| Replications | Number of runs |
| Seed | Random starting point |
| Termination mode | When should the run stop? |
| Time-based | After a fixed duration |
| Condition-based | When a rule becomes true |
| Collect time-series | Keep chart data during the run |

Helper text will explain when to use each setting.

---

### 2 — Results will answer the modeller’s questions in a clearer order

The Results workspace will be reorganized into this flow:

1. **Results summary** — what happened?
2. **How reliable are these results?** — can I trust this?
3. **Where are the bottlenecks?** — where is the pressure in the system?
4. **Detailed charts** — supporting visuals
5. **Numbers behind the charts** — raw previews and exportable data

This is a layout and language change, not a change to the underlying calculations.

---

### 3 — Technical analysis language will become easier to act on

Examples:

| Current | Planned |
|---------|---------|
| Statistical analysis | How reliable are these results? |
| Batch-means confidence intervals | Estimated range for the true result |
| replication means | results from repeated runs |
| deviates from normality | repeated runs are uneven; use more runs before making decisions |
| Data: | Source: |

The aim is that a modeller can understand the consequence of a result before reading the method used to calculate it.

---

### 4 — Model Health will sound like guidance, not validator output

The health panel will keep its precision, but its first job will be to answer:
- Can I run this?
- What should I fix?
- Where should I go next?

Validation codes will stay available, but they will no longer lead the message.

---

### 5 — Data-source setup will explain intent before syntax

Labels such as `epoch`, `B-event ID`, and raw JSON mapping text will be rephrased so the first layer explains what the modeller is trying to do.

Examples:

| Current | Planned |
|---------|---------|
| Simulation start (epoch) | Real-world start date and time |
| Target B-event ID | Arrival event to populate |
| Time field (dot path) | Time field in the incoming data |
| Attribute map (JSON...) | Match incoming fields to model fields |

Raw JSON examples will remain available through advanced help, not as the primary label.

---

### 6 — Run History will read as outcomes, not as a back-office table

Examples:

| Current | Planned |
|---------|---------|
| Run History (Last 20) | Recent runs |
| Archive selected | Hide selected runs |
| Renege rate | Left before service |
| Avg wait | Average wait |

The page should help modellers understand what happened in previous runs before asking them to export or manage the records.

---

## Design rule

When choosing between a technical term and a plain-English phrase:

- Put the plain-English phrase in the heading or label
- Keep the technical term in helper text, tooltip, or advanced detail

Example:
- Heading: **Ignore early results**
- Helper text: *Technical term: warm-up period*

---

## What will not change

- The simulation engine
- Statistical methods
- Model schema
- Advanced modelling capabilities
- Availability of technical detail for expert users

Sprint 67 is about **clarity and presentation**, not about reducing power.
