# simmodlr — LLM Model Generation Guide

**Version:** 1.0.0

## What is simmodlr?

simmodlr is a browser-based discrete-event simulation (DES) modelling tool. You describe a model in structured JSON  (entities, queues, events, distributions) and the Three-Phase engine simulates it. This guide helps you use a large language model to generate valid model JSON.

## How to Use This Guide

1. Provide **both** of these files to your LLM conversation:
   - This guide (below)
   - The **simmodlr Model Schema Reference** (`docs/model-schema-for-llm.md`)
2. Then ask the LLM to generate a model for your scenario.



## Example Prompt

```
You are a discrete-event simulation modeller. Using the simmodlr schema and guide provided:

1. Generate a valid simmodlr model JSON for [describe your scenario here]
2. Output only the JSON object — no prose, no markdown fences
3. All validation rules in §10 must be satisfied
4. Use realistic parameter values for the domain
5. Include experimentDefaults appropriate for the scenario
6. Add goals if the scenario has obvious performance targets
```

---

*For the full schema reference, provide `docs/model-schema-for-llm.md` alongside this guide to any LLM.*
