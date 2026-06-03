# Sprint 47a — Model Import & Agent API
**Sprint:** 47a — Model Import & Agent API
**Branch:** sprint-47a
**Date:** 2026-05-16

## Objective
Enable two new routes for getting LLM-generated model JSON into simmodlr: (1) a "Paste JSON" option in the UI so users can paste directly without saving a file, and (2) a Supabase Edge Function that exposes a POST endpoint an agent can call programmatically to validate and save a model in one step.

## Background
The `docs/model-schema-for-llm.md` file (added in the post-Sprint-46 commit) gives any LLM the information it needs to generate a valid simmodlr model JSON. But getting that JSON into the app currently requires: save to a `.json` file → click "Import Model" → pick the file from the file system. This is fine for occasional use but impractical for an AI agent in a loop, and inconvenient for a user who just copied JSON from a chat window.

The import pipeline in `App.jsx` already handles everything downstream: `extractImportedModelPayload()` normalises the envelope, `validateModel()` checks structural correctness, `saveModel()` persists to Supabase. Neither new feature requires new logic — only new entry points into the existing pipeline.

The Edge Function follows the pattern established by `supabase/functions/llm-proxy/` and uses the Supabase service-role client to perform a trusted insert after validation.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S47a.1 | Move `extractImportedModelPayload` and `MODEL_JSON_KEYS` out of `App.jsx` into `src/ui/shared/utils.js` and export; update `App.jsx` import | `src/ui/shared/utils.js`, `src/App.jsx` |
| S47a.2 | Add "Paste JSON" import option to App.jsx model library header: a ghost button that opens a modal with a textarea; on confirm, runs the same `extractImportedModelPayload` → `validateModel` → `saveModel` pipeline as file import; shows same error/warning/success status | `src/App.jsx` |
| S47a.3 | Create Supabase Edge Function `supabase/functions/import-model/index.ts`: accepts `POST` with JSON body `{ model: {...}, name?: string }`, authenticates via Supabase JWT, validates model structure, saves to `des_models`, returns `{ ok, modelId }` or `{ ok: false, errors: [...] }` | `supabase/functions/import-model/index.ts` |
| S47a.4 | Add API usage section to `docs/model-schema-for-llm.md`: endpoint URL pattern, auth header, request/response shape, curl example, error format | `docs/model-schema-for-llm.md` |

## Acceptance Criteria
- `extractImportedModelPayload` is exported from `src/ui/shared/utils.js`; `App.jsx` imports it from there; no behaviour change to file import
- "Paste JSON" button appears alongside "Import Model" in the model library header
- Pasting valid JSON into the textarea and clicking confirm imports the model and opens it, identical to file import
- Pasting invalid JSON (malformed syntax) shows a parse error message
- Pasting a structurally invalid model (e.g. missing entity types) shows validation errors inline before saving
- `POST /functions/v1/import-model` with a valid JWT and valid model JSON returns `{ ok: true, modelId: "<uuid>" }`
- `POST /functions/v1/import-model` with validation errors returns `{ ok: false, errors: ["[V8] No arrival source..."] }`
- `POST /functions/v1/import-model` with no/invalid auth returns 401
- `docs/model-schema-for-llm.md` includes a working curl example referencing the edge function endpoint

## Dependencies
- Existing `supabase/functions/llm-proxy/` pattern for Edge Function structure (CORS headers, auth, Supabase admin client)
- `validateModel()` engine function — inlined as a lightweight structural check in the Edge Function (Deno cannot import Vite ES modules directly)
- No UI sprint dependencies — this sprint is self-contained and can run before Sprint 47
