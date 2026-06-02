# Resolut Hybrid: implementation notes

## Scope

Current implementation is limited to AV Inform/Resolut integration for `projectId` from `RESOLUT_PROJECT_ID` (current target: `23`).

For other projects, access to this integration is blocked.

## PFP endpoints

All endpoints require authenticated agent/admin and are mounted under:

- `POST /api/pfp/resolut/products`
- `POST /api/pfp/resolut/quote`
- `POST /api/pfp/resolut/portfolio` — публикация портфеля котировок в Resolut (оформление)
- `POST /api/pfp/resolut/client` — создание / изменение клиента в Resolut
- `GET /api/pfp/resolut/client?code=<Resolut client id>` — получение клиента (upstream GET `operation=client`)
- `GET /api/pfp/resolut/link` — одноразовая ссылка перехода в Resolut (upstream GET `operation=link`; **TTL ~20 с** у партнёра — вызывать по клику)
- `POST /api/pfp/resolut/publish-preview` — фильтр/предпросмотр публикации (eligible/skipped) для mixed-портфелей
- `POST /api/pfp/resolut/suggest-quote-line` — черновик `{ code, parameters }`: **НСЖ** (`nszh_like`, `byLimit` / `byPremium`), **ИСЖ** (`iszh_like`, взнос `calcData.premium`) или **DEPOSIT/PDS** (`deposit_like`, `clientType` + `calcData.limit/capitalise/term`); см. `src/services/resolutQuoteParameters.js`
- `POST /api/pfp/resolut/plan-quotes` — сборка массива `quotes` из последнего `clients.goals_summary` (сводный портфель + fallback по целям); опционально `quote_patches`, `include_monthly_flow`
- `POST /api/pfp/resolut/plan-publish-preview` — то же + фильтр eligible/skipped как у `publish-preview`
- `POST /api/pfp/resolut/publish-from-plan` — автосборка `quotes` + публикация (оркестрация на бэке; фронт только дозаполняет `resolut_client` / patches при необходимости)
- `POST /api/pfp/resolut/publish` — оркестрация оформления: клиент Resolut (create/update) + `portfolio` + сохранение истории в БД; в ответе `data.portfolio` — нормализованные `portfolio_code` / `portfolio_number` / `contracts` (учтены плоский ответ партнёра и вложенный `content`)
- `GET /api/pfp/resolut/publications?client_id=` — история публикаций клиента (для ЛК)

Resolut `authorize` is **not** exposed as a separate PFP route: it runs inside `POST /api/pfp/auth/login` for agents on the Resolut project (same email/password as the login body), and the returned bearer is stored in [`src/services/resolutSessionStore.js`](../../../src/services/resolutSessionStore.js).

## Upstream contract mode

- `authorize` (internal only, from login):
  - `POST /` with body `{ operation: "authorize", data: { login, password, type } }`.
  - Implemented in `exchangePasswordForSessionKey` in [`src/services/resolutService.js`](../../../src/services/resolutService.js).
- `products`:
  - `POST /` with body `{ operation: "products", data: {} }`.
  - header: `Authorization: Bearer <session key from login cache OR resolut_static_key>`.
- `quote`:
  - `POST /` with body `{ operation: "quote", data: { code, parameters } }`.
  - header: same bearer resolution as `products`.
- `portfolio`:
  - `POST /` with body `{ operation: "portfolio", data: { quotes: [...], client: {...} } }`.
  - header: same bearer as `products`.
- `client`:
  - `POST /` with body `{ operation: "client", data: { ... } }` (create/update по логике партнёра).
  - `GET /?operation=client&code=<id>` — получение клиента (реализовано в [`src/services/resolutService.js`](../../../src/services/resolutService.js) как `callOperationGet`).
- `link`:
  - `GET /?operation=link` — строка URL для перехода в Resolut.

## Agent login → Resolut session (PFP backend)

For `projectId === RESOLUT_PROJECT_ID`, after successful PFP credential check on `POST /login` (agent), the backend **must** call Resolut `authorize` with the same email/password as in the login request and store the returned `key` in an in-memory cache keyed by `users.id` (`resolutSessionStore`, TTL `RESOLUT_SESSION_TTL_MS`). If Resolut rejects the pair, login fails with **401** (no silent success + broken quote later).

Subsequent `products`/`quote`/`portfolio`/`client`/`link` from that agent use this bearer first. If the cache entry is missing or expired, **`resolut_static_key`** (project setting or `RESOLUT_STATIC_KEY`) is used for background/server flows.

If there is **no** cached session and **no** static key, those operations return **401** with `ResolutSessionRequired` — agents must re-login; there is **no** env/project login+password fallback (`RESOLUT_AGENT_LOGIN` / `resolut_agent_login` removed).

**Multi-instance:** in-memory cache is per process. Use `RESOLUT_STATIC_KEY` on each instance for server-side LIFE/report paths that cannot attach to a logged-in agent, or accept LIFE fallback formula when Resolut is unavailable (see `lifeUpfrontAmount.js`).

## ISZH (investment life insurance) — OpenAPI ver3 / demo `capital`

Partner spec: [`docs/partners/resolut/openapi/api-resolute 003.yaml`](../openapi/api-resolute%20003.yaml) (`QuoteParametersISG`).

- Upstream `products` returns e.g. `pfpCode: "capital"`, program **«Капитал под управлением»** (`product: lifeInvestUniversal`).
- `quote` and `portfolio` use the **same** `parameters`: `{ calcData: { premium }, insuredPerson: { dob, sex? } }` (no `term` / `pType` / `valuationType`).
- Demo minimum premium for `capital`: **1_500_000** RUR (`calcError` below that).
- PFP: `isResolutIszhProduct` when `products.product_type === 'ISZH'` or `resolut_pfp_code` in `RESOLUT_ISZH_PFP_CODES` (default `capital`). Builders: [`src/services/resolutIszhQuoteParameters.js`](../../../src/services/resolutIszhQuoteParameters.js), router [`src/services/resolutQuoteParameters.js`](../../../src/services/resolutQuoteParameters.js).
- Catalog: create a PFP product on project 23 with `resolut_pfp_code: capital`, `product_type: ISZH`.
- LIFE goal calculator still uses **NSJ only** (`assetShort`); ISZH is quote/publish/suggest, not auto LIFE.

## DEPOSIT / PDS (demo `depAlfa`, `pdsAlfa`) — live backend vs YAML 004

Partner files received in May 2026 include `api-resolute 004.yaml`, but the **live backend contract** on `https://demo.avinfors.ru/pfp/api/pfp/` is the source of truth for now.

**Live `products` response** (observed on demo) returns:

- `selector`
- `product`
- `program`
- `restrictions`
- `pfpCode`

Examples from demo:

- `depAlfa`: `selector = deposite`, `product = deposite`, program **«Депозит Альфа 1»**, `restrictions.term.units.code = months`
- `pdsAlfa`: `selector = deposite`, `product = pds`, program **«ПДС Альфа»**, `restrictions.term.units.code = years`

**Mismatch:** `api-resolute 004.yaml` currently describes `products` with fields like `productType`, `productGroup`, `description`, `parameters`, which do **not** match the live payload above.

**Live `quote` for DEPOSIT/PDS** accepts:

- `code`: `depAlfa` or `pdsAlfa`
- `parameters.clientType`: upstream currently accepts both string (`"common"`) and object (`{ code, name }`)
- `parameters.calcData.limit`
- `parameters.calcData.capitalise`
- `parameters.calcData.term`

PFP v1 treats `clientType`, `calcData.capitalise` and `calcData.term` as **required** for DEPOSIT/PDS and fails closed on invalid manual payloads instead of silently substituting defaults.

PFP v1 normalizes `clientType` to object form:

```json
{
  "clientType": { "code": "common", "name": "Общий" },
  "calcData": { "limit": 2000000, "capitalise": false, "term": 12 }
}
```

**Term units in PFP v1 suggest flow:**

- `DEPOSIT` products use `term_months` as **months**
- `PDS` products use `term_months` converted to **full years** (`floor(term_months / 12)`, min `1`)

**Observed quote response** for `depAlfa`:

```json
{
  "premium": 2000000,
  "limit": 2195800,
  "profity": 9.79,
  "profityAmount": 195800,
  "garantProfit": 0
}
```

**Observed quote response** for `pdsAlfa`:

```json
{
  "premium": 2000000,
  "limit": 2009027.77,
  "profity": 13,
  "profityAmount": 9027.77,
  "garantProfit": 10
}
```

**Caveat:** `profity` / `profityAmount` semantics are not confirmed with the partner yet. PFP therefore **does not** enable automatic weighted-yield extraction from Resolut quote for `DEPOSIT/PDS` in v1.

**Scope in PFP v1:**

- direct `POST /api/pfp/resolut/quote` supports manual DEPOSIT/PDS payloads;
- `POST /api/pfp/resolut/suggest-quote-line` can build DEPOSIT/PDS payloads from `product_id`;
- `plan-quotes` / `publish-from-plan` still skip DEPOSIT/PDS with `deposit_like_manual_only` until contract semantics are stabilized.

## LIFE goal (NSJ) via Resolut for RESOLUT_PROJECT_ID

When `client.project_id` matches `RESOLUT_PROJECT_ID`, LIFE calculations use Resolut `quote` with PFP product code `assetShort` (override via `RESOLUT_NSJ_PFP_CODE`), mapping parameters from the goal/client into the partner’s `quote` shape. Implementation: `src/services/resolutNsjQuoteService.js`, branch in `src/algorithms/calculators/lifeUpfrontAmount.js`. Other projects still use `nsjApiService` / `api-life`.

**Background / B2C paths** (e.g. `reportService.calculateFirstRun` without `agentUserId`, client cabinet) do not have an agent bearer; for project 23 they rely on **`RESOLUT_STATIC_KEY`** if configured, otherwise Resolut quote fails and LIFE uses the **local fallback premium** (`_fallback: true` in `lifeUpfrontAmount.js`).

## Portfolio-weighted yield (INVESTMENT, OTHER, etc.) for `RESOLUT_PROJECT_ID`

Products may include optional columns:

- `resolut_pfp_code` — PFP code from upstream `products` (e.g. `assetShort`, `cashback`, `capital` for ISZH).
- `resolut_quote_p_type` — payment cadence for `quote` (`0`, `1`, `2`, `4`, `12`); if null, use env `RESOLUT_PORTFOLIO_QUOTE_PTYPE` or `0`.

**Gating:** implied annual yield from Resolut is computed **only** when `client.project_id === RESOLUT_PROJECT_ID` **and** `resolut_pfp_code` is non-empty. Otherwise the existing **`lines` / `yields`** matrix is used (no extra HTTP).

**Temporary restriction for DEPOSIT/PDS:** even with `resolut_pfp_code`, automatic yield extraction from quote is disabled until partner clarifies the exact semantics of `profity` / `profityAmount` and confirms whether `limit` is always safe to treat as end-of-term FV for planning math.

**Implementation:** [`src/services/resolutPortfolioQuoteYieldService.js`](../../../src/services/resolutPortfolioQuoteYieldService.js); integration in [`src/algorithms/calculators/BaseCalculator.js`](../../../src/algorithms/calculators/BaseCalculator.js) (`resolveInstrumentYieldsForWeightedPortfolio`, passed `context` from calculators) and [`OtherGoalCalculator.js`](../../../src/algorithms/calculators/OtherGoalCalculator.js).

**v1 limitation:** implied yield from quote is implemented for **lump-sum** payment (`pType === 0`): PV = `premium`/`premiumFull`, FV = survival benefit from `risks[]` (or top-level `limit`). Other `pType` values fall back to static `lines` if present.

**Caveat:** downstream simulation still uses a single compound monthly rate; this is an approximation for end-of-term insurance cash flows.

## PDF: Finam Report v2 for project 23 (AV Inform)

Project **23** is in `FINAM_REPORT_PROJECT_IDS` (default `14,23,28`). Report version: project-scoped **`system_settings.report_finam = 2`** (migration `database/migrations/20260515130000_report_finam_v2_av_inform_project_23.js`, or `PUT /api/pfp/settings/report_finam` with `{ "value": 2 }`). HTML/PDF pipeline: `src/reports/finam_v2/buildFinamReportV2HtmlPackage.js` (not v1 `src/reports/finam/`). Finam tenant **14** is unchanged unless it has its own `report_finam` override. See `src/reports/finam/finamTemplateProjects.js` and `.cursor/agents/finam_report_v2.md`.

## Credentials source

Bearer for Resolut:

1. In-memory session after agent `POST /auth/login` (same credentials as PFP).
2. Else `resolut_static_key` from project `system_settings` or env `RESOLUT_STATIC_KEY`.

Project setting keys (Resolut):

- `resolut_static_key`

Env keys:

- `RESOLUT_BASE_URL`
- `RESOLUT_PROJECT_ID`
- `RESOLUT_STATIC_KEY` (optional; for background / multi-instance)
- `RESOLUT_OPERATION_PATH` (default `/`)
- `RESOLUT_AUTH_TYPE` (default `ПользовательРезолют`)
- `RESOLUT_TIMEOUT_MS` (default `10000`; **clamped** to **8000–120000** ms so mis-set `1000` on Railway cannot break login)
- `RESOLUT_ENABLED` (default `true`)
- `RESOLUT_SESSION_TTL_MS` (optional, default 23h in-memory session for bearer after login)
- `RESOLUT_NSJ_PFP_CODE` (optional, default `assetShort`)
- `RESOLUT_ISZH_PFP_CODES` (optional, comma-separated; default `capital`)
- `RESOLUT_PORTFOLIO_QUOTE_PTYPE` (optional; default payment type for portfolio quote yield when `products.resolut_quote_p_type` is null)
- `FINAM_REPORT_PROJECT_IDS` (optional, default `14,23` for Finam-style PDF HTML)

## Request validation

- `products`: optional payload `{ data?: object }`.
- `quote`: required payload `{ code: string, parameters: object }`.
- `portfolio`: required payload `{ quotes: Array<{ code, parameters }>, client: object }`.
- `client` (POST): create requires `lastName`, `firstName`, `dob`, `sex`, `phone`, `email`; with `code` — update (must include fields besides `code`). Fetch only: use `GET /api/pfp/resolut/client?code=`.
- `link`: no body; `GET /api/pfp/resolut/link`.

## Response normalization

PFP returns normalized envelope:

- `ok`
- `status`
- `operation`
- `data`
- `err`

For upstream failures:

- `err.code` keeps upstream `err.code` when available.
- `err.message` keeps upstream `err.message` when available.
- `err.upstream_status` exposes upstream HTTP status.

Sensitive fields (`login`, `password`, `key`) are sanitized before attaching upstream payload to internal error details.

## Smoke checklist

1. Login + Resolut:
   - agent from project `23`;
   - `POST /api/pfp/auth/login` with valid PFP + AV Inform credentials succeeds and caches Resolut bearer; invalid Resolut pair returns **401** with message from upstream.
2. Project block for non-target project:
   - agent from project != `RESOLUT_PROJECT_ID`;
   - `POST /api/pfp/resolut/quote` returns `403` when project context is wrong.
3. Products success:
   - `POST /api/pfp/resolut/products` with `{}` or `{ "data": {} }` and valid JWT after login (or static key for background).
4. Quote validation:
   - missing `code` or `parameters` returns `400 ValidationError`.
5. Quote upstream error passthrough:
   - invalid product/parameters return normalized `err.code`/`err.message`.
6. Session required:
   - call `quote`/`products`/`portfolio`/`client`/`link` without prior login and without `RESOLUT_STATIC_KEY` → **401** `ResolutSessionRequired`.
7. Stage 2 smoke (demo): `POST /portfolio` after valid quotes + client payload returns portfolio/contract identifiers; `GET /link` returns a URL string (open immediately; short TTL).

## Diagnostics (demo, 2026-04)

Direct `authorize` to `https://demo.avinfors.ru/pfp/api/pfp/` with test agent `agent@agent.ru` / `123456` and `type=ПользовательРезолют` returns **200** and `data.key`. Direct `quote` with that Bearer may return upstream **400** `calcError` for minimal test payloads (partner validation); adjust `parameters` per partner contract — auth path is OK.
