# simmodlr — LLM Model Generation Guide

**Version:** 1.0.0

## What is simmodlr?

simmodlr is a browser-based discrete-event simulation (DES) modelling tool. You describe a model in structured JSON  (entities, queues, events, distributions) and the Three-Phase engine simulates it. This guide helps you use a large language model to generate valid model JSON.

## How to Use This Guide

1. Provide **both** of these files to your LLM conversation:
   - This guide (below)
   - The **simmodlr Model Schema Reference** (`docs/model-schema-for-llm.md`)
2. Then ask the LLM to generate a model for your scenario.

## Magic-Link Import

The LLM should produce an import URL so you can open the model directly in simmodlr.

**App URL:** `https://des.simmodlr.app`

**Magic-link format:**
```
https://des.simmodlr.app/#import?m=<base64url-encoded-json>
```

### Encoding Recipe (Python)

```python
import json, base64

def encode_model_link(model: dict) -> str:
    json_bytes = json.dumps(model, separators=(',', ':')).encode('utf-8')
    b64 = base64.urlsafe_b64encode(json_bytes).rstrip(b'=').decode()
    return f"https://des.simmodlr.app/#import?m={b64}"

# Save file and print link
with open('model.json', 'w') as f:
    json.dump(model, f, indent=2)
print(encode_model_link(model))
```

### Encoding Recipe (JavaScript / Node)

```js
const fs = require('fs');

function encodeModelLink(model) {
  const b64 = Buffer.from(JSON.stringify(model), 'utf8').toString('base64url');
  return `https://des.simmodlr.app/#import?m=${b64}`;
}

fs.writeFileSync('model.json', JSON.stringify(model, null, 2));
console.log(encodeModelLink(model));
```

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

After generation, ask the LLM to also provide a magic-link import URL using the encoding recipe above. Open the link in your browser — simmodlr shows a pre-flight preview card. Review and save to your library with one click.

---

*For the full schema reference, provide `docs/model-schema-for-llm.md` alongside this guide to any LLM.*
