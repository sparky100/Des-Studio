# SaaS Administration & User Management — Plan

*Status: Implemented in Sprint 21 (2026-05-11)*

DES Studio currently runs on Supabase with auth. Adding a SaaS admin layer requires:
- A `platform_config` table for system-wide settings
- An admin panel UI (protected by `profiles.role = "admin"`)
- Admin user management (list, suspend, change roles)
- Dynamic LLM provider configuration

---

## 2. Database Changes

### 2.1 Platform Config Table

```sql
CREATE TABLE IF NOT EXISTS platform_config (
  key   text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at   timestamptz DEFAULT now(),
  updated_by   uuid REFERENCES auth.users(id)
);
```

Seed defaults:
```sql
INSERT INTO platform_config (key, value) VALUES
  ('llm', '{"provider":"anthropic","model":"claude-sonnet-4-20250514","maxTokensPerRun":450,"maxTokensPerModel":4000,"rateLimitPerHour":25}'),
  ('features', '{"allowAnonymous":true,"maxModelsPerUser":100,"maxRunsPerModel":500,"allowSharing":true}'),
  ('limits', '{"maxReplications":50,"maxSweepPoints":50,"maxSimTime":100000}');
```

### 2.2 Update Profiles

- `profiles.suspended` (boolean) — admin can suspend a user
- `profiles.plan` (text) — "free" | "pro" | "enterprise" (future)

---

## 3. Backend Changes

### 3.1 Supabase Edge Function — Config-Aware LLM Proxy

The current `llm-proxy/index.ts` reads `LLM_PROVIDER` and `LLM_MODEL` from environment variables. Instead, it should:

1. At startup, fetch config from `platform_config WHERE key = 'llm'`
2. Use the stored `provider`, `model`, and `apiKey` fields
3. Support multiple providers: `anthropic`, `openai`, `opencode-go`

New `platform_config.llm` structure:
```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "apiKey": "sk-ant-...",
  "maxTokensPerRun": 450,
  "maxTokensPerModel": 4000,
  "rateLimitPerHour": 25,
  "temperature": 0.3
}
```

### 3.2 New DB Functions in `models.js`

| Function | Purpose |
|---|---|
| `getPlatformConfig(key)` | Fetch a config value |
| `setPlatformConfig(key, value, userId)` | Update config (admin only + RLS) |
| `fetchUsers()` | List all profiles (admin only) |
| `updateUserRole(userId, role)` | Change user role (admin only) |
| `suspendUser(userId, suspended)` | Suspend/unsuspend user |
| `fetchUserRunStats(userId)` | Get run counts, model counts per user |

All admin-only functions enforce `.eq("role", "admin")` or RLS policies.

---

## 4. Admin UI — New "Admin" Panel

### 4.1 Tab in ModelDetail or New Route

Two approaches:
- **A)** Admin tab in the model library sidebar (App.jsx) — visible only to admins
- **B)** A separate admin route like `#admin`

Recommend **A** — Admin link in the header bar (next to user avatar/sign-out) that opens a modal or panel.

### 4.2 Admin Panel Sections

#### LLM Configuration

```
┌─────────────────────────────────────────────┐
│  LLM PROVIDER                               │
│                                             │
│  Provider:  [anthropic ▼]                   │
│  Model:     [claude-sonnet-4-20250514 ▼]    │
│  API Key:   [••••••••••••••••••] [Show]     │
│  Max tokens per analysis: [450]             │
│  Rate limit per hour:     [25]              │
│  Temperature:             [0.3]             │
│                                             │
│  [Test Connection] [Save Configuration]     │
│  Status: ✓ Connected on claude-sonnet-4     │
└─────────────────────────────────────────────┘
```

- Provider dropdown: anthropic, openai, opencode-go
- Model dropdown: dynamically populated based on provider
- Admin can toggle visibility of API key field
- "Test Connection" sends a minimal ping to validate the key
- Changes take effect immediately (edge function reads config per-request)

#### User Management

```
┌─────────────────────────────────────────────┐
│  USERS                    [Search...]       │
│                                             │
│  User           Role     Models  Runs  Plan │
│  ─────────────────────────────────────────  │
│  alice@...      admin     12     45   pro   │
│  bob@...        user      5      18   free  │
│  carol@...      user      2       3   free  │
│                                             │
│  [Edit] [Suspend] [Promote to Admin]        │
└─────────────────────────────────────────────┘
```

- Search by email or name
- Click a user to expand details (their models, recent runs)
- Actions: suspend, change role, view usage

#### Platform Limits

```
┌─────────────────────────────────────────────┐
│  PLATFORM LIMITS                            │
│                                             │
│  Max models per user:     [100]             │
│  Max runs per model:      [500]             │
│  Max replications:        [50]              │
│  Max sweep points:        [50]              │
│  Max simulation time:     [100000]          │
│  Allow anonymous mode:    [✓]              │
│  Allow sharing:           [✓]              │
│                                             │
│  [Save]                                     │
└─────────────────────────────────────────────┘
```

---

## 5. Frontend — RLS & Enforcement

### 5.1 API Functions (`models.js`)

```javascript
export async function getPlatformConfig(key) {
  const { data, error } = await supabase
    .from("platform_config")
    .select("value")
    .eq("key", key)
    .single();
  if (error) throw error;
  return data?.value;
}

export async function setPlatformConfig(key, value, userId) {
  const { error } = await supabase
    .from("platform_config")
    .upsert({ key, value, updated_by: userId })
    .eq("key", key);
  if (error) throw error;
}

export async function fetchUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}
```

### 5.2 RLS Policies

```sql
-- platform_config: admins can read/write, users can read (for limits enforcement)
CREATE POLICY "admins can manage config"
  ON platform_config FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

CREATE POLICY "users can read config"
  ON platform_config FOR SELECT
  USING (true);
```

---

## 6. Edge Function Updates

The `llm-proxy/index.ts` needs to:

1. **Read config from the database** instead of env vars:
```typescript
async function getProviderConfig(supabaseClient): Promise<LlmProviderConfig> {
  const { data } = await supabaseClient
    .from("platform_config")
    .select("value")
    .eq("key", "llm")
    .single();
  const cfg = data?.value || {};
  return {
    provider: cfg.provider || "anthropic",
    model: cfg.model || "claude-sonnet-4-20250514",
    apiKey: cfg.apiKey || Deno.env.get("ANTHROPIC_API_KEY") || "",
  };
}
```

2. **Support multiple providers** in `callProvider()`:
- `anthropic` → existing Anthropic API call
- `openai` → OpenAI API call  
- `opencode-go` → OpenCode Go API call

3. **Apply rate limits** from config instead of hardcoded 10/hour

---

## 7. Implementation Order

| Step | What | Effort |
|---|---|---|
| 1 | `platform_config` table + migration | ~15 min |
| 2 | CRUD functions in `models.js` | ~30 min |
| 3 | Admin panel UI (LLM config tab) | ~2 hrs |
| 4 | Admin panel UI (Users tab) | ~2 hrs |
| 5 | Update edge function to read config from DB | ~1 hr |
| 6 | Add multi-provider support to edge function | ~2 hrs |
| 7 | RLS policies | ~15 min |
| 8 | Tests | ~1 hr |
| **Total** | | **~9 hrs (1-2 sprint days)** |

---

## 8. Key Decisions

| Decision | Recommendation |
|---|---|
| API key storage | In `platform_config` JSONB (encrypted at rest by Supabase) or use Vault |
| Edge function vs direct | Keep edge function as proxy — it enforces rate limits, config, and hides keys from the client |
| Model list for dropdown | Hardcode common model list in the UI, or fetch from a Supabase table |
| Test connection | Edge function pings the LLM with a minimal prompt ("Respond with OK") and reports success/failure |
| Anonymous mode enforcement | Limits checks happen in the edge function, UI shows warnings before run |
