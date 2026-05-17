# DES Studio — Real-Time Data Integration Guide

**Version:** 1.0.0
**Sprint baseline:** Sprint 57 (adapter layer foundation)
**Audience:** Operations analysts and system administrators enabling live data feeds for DES Studio models

---

## Overview

DES Studio can connect to external operational data sources so that model parameters (arrival rates, service times, resource capacities) are updated from live systems before or during a simulation run. This removes the need to manually recalibrate models each day and enables three new operational patterns:

| Pattern | Description |
|---|---|
| **Calibrated batch** | Fetch live parameters once when the run starts, then run all replications with those frozen values. Results remain reproducible. |
| **Rolling single run** | Re-sample parameters on each scheduling event as the simulation advances. Tracks a live system in real time. |
| **Predictive lookahead** | Inject the current system state (queue lengths, entities in service) and simulate forward a defined horizon (e.g. 60 minutes). Used for real-time decision support. |

> **Sprint 57 delivers the engine foundation.** The Calibrated Batch UI and live connection management are delivered in Sprint 58. Rolling mode in Sprint 59. Lookahead in Sprint 60. This guide describes the complete intended integration, with sections noting which sprints each capability becomes available.

---

## What Your Organisation Needs to Provide

### 1. A data endpoint (required for any live data pattern)

DES Studio connects to HTTP REST endpoints or WebSocket streams that return current operational metrics. Your system must expose at least one of:

**Option A — REST API (simplest)**

An HTTP endpoint that returns a JSON object containing the parameter values DES Studio should use. It must:
- Be reachable from the user's browser (i.e. CORS-enabled or on the same origin)
- Return a valid JSON response body
- Respond within 10 seconds

Example response:

```json
{
  "mean_interarrival_mins": 2.4,
  "mean_service_mins": 8.1,
  "current_server_count": 4,
  "queue_depth": 12
}
```

Nested fields are supported using dot-notation (e.g. `arrivals.mean`, `triage.serviceTime.mean`).

**Option B — WebSocket stream (Sprint 59+)**

A WebSocket endpoint that pushes updates as conditions change. DES Studio subscribes and uses the most recently received message. The message must be a JSON object with the same field structure as Option A.

**Option C — State snapshot endpoint (Sprint 60+)**

An endpoint that returns the current system state in a format DES Studio can use to initialise a lookahead run. See [Appendix A — Snapshot endpoint contract](#appendix-a--snapshot-endpoint-contract).

---

### 2. Authentication credentials (if your endpoint requires them)

DES Studio supports a single bearer-style header (e.g. `Authorization: Bearer <token>`, `X-API-Key: <key>`). More complex auth schemes (OAuth2, mTLS) are not yet supported.

Credentials are:
- Entered by the modeller per browser session
- Stored in `sessionStorage` only — they are **never written to the database**
- Referenced in the model configuration as `{{env.YOUR_VAR_NAME}}` placeholders — the placeholder is stored, not the value

> If your endpoint is public or uses IP allowlisting, no credential configuration is needed.

---

### 3. Network accessibility

The endpoint must be reachable from the user's browser at runtime:
- If DES Studio is hosted at `https://app.des-studio.com`, your endpoint must either be on the same origin or have CORS headers permitting requests from that origin
- If your endpoint is on an internal network, users must be on VPN or the endpoint must be accessible via a secure proxy

---

## Setting Up a Data Source in the Model (Sprint 58+)

### Step 1 — Open Data Source Manager

In the model editor, open the **Settings** tab and find the **Data Sources** section. Click **Add data source**.

### Step 2 — Configure the source

| Field | Description | Example |
|---|---|---|
| **Label** | A human-readable name shown in the binding editor | `Triage Arrival Rate` |
| **Type** | `REST` (Sprint 58), `WebSocket` (Sprint 59), `State Snapshot` (Sprint 60) | `REST` |
| **URL** | Full URL to the endpoint | `https://ops.hospital.org/api/sim-feed` |
| **Auth header** | Header name to send the credential in | `Authorization` |
| **Credential variable** | `{{env.VAR}}` placeholder — you enter the actual value in the credential slot below | `{{env.HOSPITAL_API_KEY}}` |
| **Refresh interval** | How often to re-fetch (REST only; minimum 10 seconds) | `60` |

### Step 3 — Enter your credential

Below the data source form, enter the actual credential value in the **Session credential** field. This value is stored only in your browser session — it is cleared when you close the tab.

### Step 4 — Test the connection

Click **Test connection**. DES Studio will make one request to the endpoint and show the raw JSON response. Confirm the fields you need are present.

---

## Binding Parameters to Live Values (Sprint 58+)

Once a data source is configured, you can bind any distribution parameter to a live field.

### In the B-Event editor (arrival rates)

1. Open the B-Event whose schedule you want to live-update (e.g. "Patient Arrives")
2. In the **Schedule** section, find the distribution parameter you want to bind (e.g. `mean` for an Exponential distribution)
3. Toggle the field from **Static** to **Live**
4. Select the data source from the dropdown
5. Enter the field path (e.g. `mean_interarrival_mins` or `arrivals.mean`)
6. Enter a fallback value — used if the source is unavailable when the run starts
7. The preview chip shows the current live value fetched from the source

### In the C-Event editor (service times)

Same steps as above, applied to the **cSchedule** service time distribution parameter.

---

## Running with Live Data (Sprint 58+)

When a model has at least one live-bound parameter, the **Run** panel shows a mode selector:

### Calibrated batch (recommended for multi-replication studies)

1. Select **Calibrated batch** in the run mode selector
2. Click **Run** — DES Studio fetches all live values once, then runs all replications using those frozen values
3. Results are reproducible: re-running at the same moment produces identical output
4. A summary banner shows which values were fetched and when

### Rolling single run (Sprint 59+)

1. Select **Rolling** in the run mode selector
2. Replications is locked to 1
3. Click **Run** — parameters are re-sampled from the live source on each FEL scheduling event
4. A live banner shows the current parameter values and when they were last refreshed
5. The run continues until `maxSimTime` is reached

### Predictive lookahead (Sprint 60+)

1. Configure a **State Snapshot** data source pointing at your system snapshot endpoint
2. Select **Lookahead** in the run mode selector
3. Set the lookahead horizon (e.g. `60` minutes)
4. Click **Run** — DES Studio fetches the live system state, injects it as the starting state (bypassing warm-up), and runs forward the defined horizon
5. Compare multiple scenarios by adjusting parameters and running again

---

## Model JSON Reference

For modellers or developers who configure models programmatically, here are the relevant schema fields.

### `model.dataSources[]`

Defined at the top level of the model JSON. Lives inside the `model_json` JSONB column — no Supabase schema change required.

```json
{
  "dataSources": [
    {
      "id": "ds_arrivals",
      "label": "Live Arrival Feed",
      "type": "rest",
      "url": "https://ops.example.com/sim-feed",
      "authHeader": "Authorization",
      "authSecret": "{{env.OPS_TOKEN}}",
      "refreshSecs": 60
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique within the model; referenced by `paramSource.sourceId` |
| `label` | Yes | Human-readable name shown in the UI |
| `type` | Yes | `"rest"` \| `"websocket"` \| `"stateSnapshot"` \| `"mock"` |
| `url` | Yes | Full URL |
| `authHeader` | No | Header name for authentication |
| `authSecret` | No | `{{env.VAR}}` placeholder (never a literal secret) |
| `refreshSecs` | No | TTL for cached value (REST only; default 60) |

### `paramSource` on a schedule or cSchedule

```json
{
  "dist": "Exponential",
  "distParams": { "mean": "1.5" },
  "paramSource": {
    "sourceId": "ds_arrivals",
    "field": "mean_interarrival_mins",
    "targetParam": "mean",
    "fallback": "1.5"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `sourceId` | Yes | Must match a `dataSources[].id` value |
| `field` | Yes | Dot-notation path into the API response JSON (e.g. `mean` or `arrivals.mean`) |
| `targetParam` | No | Which key in `distParams` to replace; defaults to the first key |
| `fallback` | No | Value to use if the source is unavailable; if absent, the static `distParams` value is preserved |

### `model.experimentDefaults.liveDataMode`

```json
"liveDataMode": "calibrated_batch"
```

| Value | Description |
|---|---|
| `null` or absent | Static run — no live data; current default behaviour |
| `"calibrated_batch"` | Fetch once before run; all replications use frozen values (Sprint 58) |
| `"rolling"` | Re-sample on each FEL event; replications locked to 1 (Sprint 59) |
| `"lookahead"` | Inject live snapshot; skip warm-up; simulate forward N minutes (Sprint 60) |

---

## Security Considerations

| Concern | How it is addressed |
|---|---|
| **Credentials in the database** | Never stored. `authSecret` fields in `dataSources` contain only `{{env.VAR}}` placeholders. Actual values live only in `sessionStorage`. |
| **Credentials in exports** | Run exports contain resolved parameter values (the number DES Studio used), not the raw API credentials. |
| **Data from live sources** | Fetched data is used only to update model parameters. It is not stored in run history or shown to other users. |
| **Shared/public models** | `dataSources[]` definitions (URLs, field paths, header names) are visible to anyone who can view the model. Only credentials are protected. Avoid putting sensitive endpoint URLs in shared models. |
| **Endpoint access control** | DES Studio respects your endpoint's access controls. It makes requests as a standard browser client; if the endpoint requires authentication, provide the credential. |
| **HTTPS** | Always use `https://` endpoints. `http://` endpoints will be blocked by the browser's mixed-content policy when DES Studio is served over HTTPS. |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Test connection failed — network error" | CORS not configured on your endpoint | Add `Access-Control-Allow-Origin: https://your-des-studio-host` to your endpoint's response headers |
| "Test connection failed — HTTP 401" | Wrong or missing credential | Check the credential value entered in the session credential slot |
| "Test connection failed — HTTP 403" | Correct credential but insufficient permissions | Check that the API key/token has read access to the sim-feed endpoint |
| "Field not found in response" | Wrong field path | Use the **Test connection** result to verify the exact JSON structure and correct the field path |
| "Run used fallback value for all live parameters" | `prefetchAll()` failed silently | Check browser console for network errors; verify the endpoint is reachable and the credential is valid |
| Live run banner shows stale value | `refreshSecs` TTL has not expired | Reduce `refreshSecs` on the data source, or use WebSocket (Sprint 59) for push-based updates |

---

## Appendix A — Snapshot Endpoint Contract

*(Sprint 60+)*

For **Predictive lookahead** mode, DES Studio expects a snapshot endpoint to return a JSON object with the following structure:

```json
{
  "clock": 0,
  "entities": [
    {
      "type": "Patient",
      "id": "P-001",
      "attrs": { "acuity": 3, "arrivalTime": 0 },
      "location": "queue",
      "queueId": "Triage"
    },
    {
      "type": "Nurse",
      "id": "N-001",
      "attrs": {},
      "location": "server"
    }
  ],
  "queues": {
    "Triage": { "waiting": 4, "serving": 0 },
    "Assessment": { "waiting": 1, "serving": 2 }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `clock` | number | Time offset applied to the injected state (usually 0 — treat "now" as t=0) |
| `entities[]` | array | All currently active entities in the real system |
| `entities[].type` | string | Must exactly match an entity type name defined in the model |
| `entities[].id` | string | Unique identifier from the real system; used for audit only |
| `entities[].attrs` | object | Current attribute values for the entity |
| `entities[].location` | `"queue"` or `"server"` | Where the entity currently is |
| `entities[].queueId` | string | Required when `location === "queue"`; must match a queue name in the model |
| `queues` | object | Keys are queue names as defined in the model |
| `queues[name].waiting` | integer | Number of entities currently waiting |
| `queues[name].serving` | integer | Number of entities currently being served |

**Validation:** DES Studio validates the snapshot before injecting it. Runs are aborted with a user-readable error message if:
- An entity type is not found in the model
- A `queueId` does not match any queue in the model
- Required fields are missing

---

## Appendix B — Example Integration: NHS 111 Triage

This example shows how a hospital A&E triage department would configure DES Studio for a calibrated batch run, fetching live data from a queue management system (QMS) REST API.

### What the QMS exposes

```
GET https://qms.hospital.nhs.uk/api/des-feed
Authorization: Bearer <token>

Response:
{
  "current_triage_queue": 8,
  "mean_interarrival_mins": 3.2,
  "mean_triage_mins": 7.4,
  "mean_assessment_mins": 22.1,
  "nurse_count": 6,
  "doctor_count": 2
}
```

### Data source configuration

```json
{
  "id": "ds_qms",
  "label": "A&E Queue Management System",
  "type": "rest",
  "url": "https://qms.hospital.nhs.uk/api/des-feed",
  "authHeader": "Authorization",
  "authSecret": "{{env.QMS_TOKEN}}",
  "refreshSecs": 120
}
```

### Parameter bindings

| B/C-Event | distParams key | paramSource field | Live value example |
|---|---|---|---|
| Patient Arrives → schedule.mean | `mean` | `mean_interarrival_mins` | 3.2 |
| Start Triage → cSchedule.mean | `mean` | `mean_triage_mins` | 7.4 |
| Start Assessment → cSchedule.mean | `mean` | `mean_assessment_mins` | 22.1 |

### Session setup

1. Obtain a QMS API token from the hospital IT team
2. Open the model in DES Studio
3. Go to Settings → Data Sources → select `A&E Queue Management System`
4. In the **Session credential** field, enter `Bearer <your-token>`
5. Click **Test connection** — confirm the response shows the expected fields
6. Click **Run** with mode set to **Calibrated batch**
7. DES Studio fetches live values, freezes them, and runs all replications

---

*For technical questions about the adapter layer, see `src/engine/adapters/` and the Sprint 57 plan at `docs/reviews/sprint-57-plan.md`.*
