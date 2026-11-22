# Vetted

**Vendor and carrier clearance for a 3PL, done end to end.** Give Vetted a new vendor's name and website. It proves the
business is registered and trading, finds who runs it, screens those people against the news, clears namesakes, checks
the tax ID and bank details, and returns a decision in which every fact links to the record it came from. A person approves
only the actions that cannot be undone, and each of those happens exactly once, even if the service is killed and restarted.

ContextCon 05 · BITS Pilani · Track: **Trust and compliance** (5.1 The Vendor Check, 5.2 The Adverse Media Screen)

---

## Who uses it

The website is the **client's** workspace (the 3PL's vendor desk): onboarding staff run checks, approvers decide, the
admin keeps the vendor master. The vendor never logs in; it only receives a clear email. Our own unit economics
(cost per check, credits, margin) are deliberately **not** shown in the client's app; they are below and in the cost ledger.

## The job, and who pays for it today

A mid-size 3PL adds new transporters, fleet owners, warehouse operators and suppliers every week. Before a vendor goes into
the vendor master and is paid, someone has to establish that it is a real, active business, that it is not a duplicate or a
lookalike, and that the people running it are clean.

Today the 3PL's **procurement and compliance team** does this by hand, often with **outside verification firms paid per
business checked**. It takes days per vendor and holds up the first dispatch.

**Vetted does the whole job.** The finished work is *a vendor cleared, with the evidence on file*, or a clear "no" or
"cannot verify" with what is missing.

| | |
|---|---|
| **Buyer** | Head of Procurement / Vendor Management, or Head of Compliance, at the 3PL |
| **Price** | **₹999 per vendor processed**, whatever the outcome (a flat fee, so the service has no reason to clear a vendor it shouldn't) |
| **Measured cost per job** | **About ₹28 on average, ₹37–39 for a large company** (full cost with nothing cached, from the cost ledger); about 60–95 s per vendor. Exact duplicates cost ₹0. The ledger keeps both the full cost and what was actually paid after cache reuse. |
| **Credit → ₹ assumption** | ₹8.5 per credit (≈ $0.10 at ≈ ₹85/$), set in `policy.yaml` → `pricing.inr_per_credit` |

## Input

A request in either form:

```json
{"vendor_name": "Blue Dart Express Limited", "website": "bluedart.com", "entity_type": "public limited",
 "cin": "optional", "llpin": "optional", "gstin": "optional", "pan": "optional", "udyam": "optional",
 "city": "optional", "pincode": "optional", "claimed_since": "optional year",
 "bank_account": "optional", "ifsc": "optional", "account_holder": "optional",
 "contact_name": "optional", "contact_designation": "optional", "contact_email": "optional",
 "directors": ["optional, as named on the application"]}
```

several vendors at once:

```json
{"vendors": [{"vendor_name": "Delhivery Limited", "website": "delhivery.com"}, {"vendor_name": "VRL Logistics Limited", "website": "vrlgroup.in"}]}
```

or free text, exactly as the client wrote it (one vendor or several; several are split and checked one after another):

```json
{"text": "Here is a new vendor's name and website: ... Tell me whether it is a real, trading business: who runs it, how long it has existed, and anything that looks off."}
```

## Finished result

One decision per vendor, the four answers, and the evidence:

| Decision | Meaning | What a person does |
|---|---|---|
| `CLEARED` | Registered, Active, trading signals found, no red flags | Approves *add to vendor master* and the onboarding email |
| `DUPLICATE_HELD` | Same GSTIN / PAN / CIN / domain, or a near-identical name, already in the vendor master | Merges or rejects |
| `REJECTED` | The registry says no (e.g. Strike Off, Dissolved) | Approves the notice to the vendor |
| `REFER` | Red flags: lookalike name, shared bank account, bad GSTIN, adverse news naming a director with the company | Reviews before money moves |
| `CANNOT_VERIFY` | No record settles it. The output **names what is missing** | Asks the vendor for it |

**Claimed vs record.** Everything the vendor claims is compared with a record and shown side by side: contact email domain
(free mailboxes and other domains are flagged), whether the contact person works at the company (Crustdata Person Search),
"in business since" against the incorporation date, PIN code against the MCA registered address, bank account holder against
the legal name, PAN against the GSTIN, and the Udyam (MSME) number format (MSME vendors must be paid within 45 days).

The four answers the client asked for: **real and trading?**, **who runs it?** (directors with DIN, confirmed at the company
where Crustdata shows their current role there), **how long has it existed?** (incorporation date) and **anything off?**

Every fact carries its **source link, the exact passage or API field, the record's date and the retrieval date**, for example:

> **Status: Active**, from the company status field of the MCA company record (InstaFinancials,
> `https://www.instafinancials.com/company/x-L63090DL2011PLC221234`), record dated 10-November-2026, retrieved 2026-11-22.

A fact whose value does not appear in its own quoted passage is dropped by the source check and cannot support a decision.

## Plans and payments

Plans live in `policy.yaml` (Pay as you go ₹999 per vendor · Growth ₹19,999/month with 30 checks and re-screening of
200 vendors · Scale ₹59,999/month with 120 checks and 1,000 monitored vendors). The **Billing** page shows the plan, this
month's checks and the invoice preview; **Checkout** takes payment in **test mode only**:

- with `RAZORPAY_KEY_ID` (`rzp_test_...`) and `RAZORPAY_KEY_SECRET` set, it creates a Razorpay order and opens Razorpay
  Checkout; the payment signature is verified on the server before the plan changes;
- without keys it runs a clearly labelled **simulated test payment** (no provider, no card, no money).

Each order is paid exactly once: a repeated confirmation returns "already paid" and changes nothing.

## Next: many 3PLs on one service (designed, not built in this event)

- a `companies` table with every run, action, vendor and setting scoped to one company, so no client sees another's data;
- sign-up and log-in with roles (admin, approver, analyst) replacing approver PINs;
- emails sent in each client's name, per-client policy, approvers and vendor master;
- usage metered and invoiced per company; API keys so a client's ERP can send vendors;
- an operator console (all companies, usage, our cost per check and margin) for Vetted staff only;
- Postgres instead of SQLite for hosting with a lasting database.

## Evidence file

Every check can be downloaded as an evidence file (`GET /api/runs/{id}/evidence`, Markdown) or printed as a PDF
(`?fmt=html&print=1`): the decision, the four answers, every fact with its source, passage and dates, the personal data used,
the approvals with approver and reason, and restarts. It is written for the client and its auditors, so it carries no
provider costs. For screening, the run log is at `GET /api/runs/{id}/log` and the cost ledger at `GET /api/runs/{id}/ledger`.

## Pass mark

- **0 wrong clearances.** A vendor is never `CLEARED` without an Active registry record tied to it by a second identifier
  (the supplied CIN, the website on the record, the exact legal name or the city).
- **Hard cases correct or `CANNOT_VERIFY`:** duplicates, lookalike names, common names with nothing to tell them apart.
- **Every fact sourced** (passage + date); facts from model memory are impossible by construction.
- **Each irreversible action executed exactly once** after a kill and restart.
- **Within limits:** ≤ 240 s, ≤ 40 credits and ≤ ₹400 per vendor (all in `policy.yaml`).

Current result on `tests/cases.json`: **13 / 13 passed, 0 wrong answers.**

## Data sources the service calls

| Source | What for |
|---|---|
| Crustdata `POST /company/identify` | Resolve the name and the website to a company; lookalike candidates |
| Crustdata `POST /company/enrich` | Headcount (dated), hiring, news, founders/CXOs with current roles |
| Crustdata `POST /person/search` + `POST /person/enrich` | Is each top director's current role at this company? (title and start date) |
| Crustdata `POST /web/search/live` | Find the CIN; news search for adverse media on each director |
| Crustdata `POST /web/enrich/live` | Check the vendor's website is live |
| MCA company records via InstaFinancials (public pages) | Legal name, CIN, status, incorporation date, registered address, website, record date |
| MCA company records via Tofler (public pages) | Directors with DIN and tenure |
| companydetails.in (public pages) | CIN lookup from a legal name |
| Razorpay IFSC directory (`ifsc.razorpay.com`) | Bank and branch for an IFSC |
| The vendor's own website (direct fetch, fallback) | Live check when the Crustdata fetch is blocked |
| Groq (`openai/gpt-oss-120b`) | Only to read a free-text request into fields. Never a source of facts. Optional: the service works without it |

A timeout or a block is reported as *the source did not respond*, never as *no record*.

## How it works

See [docs/architecture.md](docs/architecture.md) for the diagram.

1. **Read the request** (fields, or free text via the LLM, or patterns as fallback)
2. **Duplicate check** against the client's vendor master (exact duplicates stop here at ₹0)
3. **Find the company** (Crustdata identify by website and by name and brand; lookalike detection)
4. **Company profile** (Crustdata enrich)
5. **Registry record** (CIN found and confirmed; status, incorporation, address; directors)
6. **Website check**
7. **Tax ID and bank** (GSTIN check digit, state and embedded PAN; IFSC lookup)
8. **Who runs it** (registry directors matched to people Crustdata shows at the company)
9. **News screen** (each director; an adverse article counts only if it also names the company, the DIN or the city;
   otherwise it is recorded as a cleared namesake)
10. **Source check** and **decision** (rules in `policy.yaml`, plain code)
11. **Approval queue** (approve / hold / block, with a named approver) → **exactly-once actions**

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # add CRUSTDATA_API_KEY and (optional) GROQ_API_KEY

# web app + API (the built UI is served from ui/dist)
.venv/bin/uvicorn vetted.api:app --port 8000      # open http://localhost:8000

# command line
.venv/bin/python -m vetted run --name "Blue Dart Express Limited" --website bluedart.com --md
.venv/bin/python -m vetted run --text "Please clear TCI Express Limited, tciexpress.in"
.venv/bin/python -m vetted resume <run_id>
.venv/bin/python -m vetted actions --status pending_approval
.venv/bin/python -m vetted decide <action_id> approve --approver "Your Name" --pin 1234
.venv/bin/python -m vetted execute
.venv/bin/python -m vetted import-master clients_vendor_master.csv
.venv/bin/python -m vetted run --file batch.json        # {"vendors": [...]}
.venv/bin/python -m vetted purge                         # delete runs older than privacy.retention_days
.venv/bin/python -m vetted reset                         # clear demo runs and actions (keeps the cache)

# tests
.venv/bin/python -m tests.evaluate            # pass rate on tests/cases.json (runs on an isolated copy of the database)
.venv/bin/python -m tests.kill_test           # kill -9 mid-run, restart, check each action happens once
```

## Hosting

- **Backend on Render** (`render.yaml`): `pip install -r requirements.txt`, then `uvicorn vetted.api:app --host 0.0.0.0 --port $PORT`.
  Set the secrets from `.env.example` in the Render dashboard. On the free plan the disk is not kept between restarts, so
  the service re-loads the fixture vendor master on start; `MAX_RUNS_PER_HOUR` caps public use.
- **Website on Vercel** (root directory `ui`): `ui/vercel.json` forwards `/api/*` to the Render service.
- For the live kill-and-restart demo, run the service locally (see below).

UI development: `cd ui && npm install && npm run dev` (proxies `/api` to port 8000); `npm run build` refreshes `ui/dist`.

## Stop and restart

- Every step's output is saved to SQLite (WAL, `synchronous=FULL`) as it finishes. On start-up the API resumes every run left
  `running` from its first unfinished step.
- Every external response is cached by request, so a resumed run never pays for the same call twice.
- Irreversible actions go through an outbox: `pending_approval → approved → executing → done`, keyed by an idempotency key.
  An action a crash left in `executing` is checked, not repeated: if its effect exists (the vendor row, the sent email's file)
  it is marked done; only otherwise is it run.
- `tests/kill_test.py` proves it: kill -9 mid-run → restart → run finishes with 0 repeated paid calls → actions approved →
  crash simulated after the effect → restart → every action `executed_count = 1`.

## Personal data and approvals

- The only personal data used is directors' names and DINs from public company records, and the current roles Crustdata shows.
  No personal emails or phone numbers are fetched.
- Nobody is flagged on a name match alone: an adverse article must also name the company, the DIN or the company's city.
  Cleared namesakes are recorded with the reason.
- A small business with little online presence gets `CANNOT_VERIFY` and a list of documents to send, never a rejection.
- Every rejection, every email and every change to the vendor master waits for a named person. The vendor is told why and can reply.
- Emails go to the address entered for the demo (a teammate), never to a real vendor.
- Every report carries a **Personal data used** record: each name and DIN, where it came from, why it was used, and
  that it is deleted after `privacy.retention_days` (30). `python -m vetted purge` enforces it.
- Blocking an action needs a written reason, which is recorded and shared with the vendor.
- Bank account numbers are never stored in full: only a one-way hash (used for the shared-account check) and the last 4 digits.
- The form asks only for what a check uses. A name or a website is enough; everything else is optional and each optional
  field is compared with a record.
- **Only named approvers can decide.** Approvers and their PINs live in `.env` (`APPROVERS="Name:PIN,..."`); the PIN is
  checked on the server and every verdict is recorded with the approver's name, time and reason (the **Audit trail**).
- **Agents write only to the team.** Email is sent through SMTP only to addresses on `policy.yaml` → `email.allow_domains`;
  anything else is saved as a file and never sent.

## Requirement changes

Thresholds, limits, pricing, the decision rules and the output fields live in [`policy.yaml`](policy.yaml), which is re-read
on every run. `simulate.unavailable: ["registry"]` (or `["web"]`) makes that source time out, to show that a slow source is
reported as *did not respond*, never as *no record*. Each check is a step function in `vetted/pipeline.py`, so a new check is one function plus one line in `STEPS`.

## Repository

```
vetted/            service: pipeline, clients (Crustdata, registry, LLM), store, actions, API, CLI
ui/                React + Tailwind web app (ui/dist is the built copy the API serves)
tests/             evaluation set + script, kill test, smoke run, vendor-master fixture (mock data, tests only)
docs/              architecture diagram
policy.yaml        every rule, threshold and limit
```

## Prepared before the build

Before building began at 10:15 AM we prepared only the idea, notes on the event rules and the Crustdata docs, and a written
plan. No code was written before the build.

## Open-source software used

FastAPI (MIT), Uvicorn (BSD-3), httpx (BSD-3), Pydantic (MIT), PyYAML (MIT), python-dotenv (BSD-3), Beautiful Soup (MIT),
RapidFuzz (MIT), python-multipart (Apache-2.0), React (MIT), Vite (MIT), Tailwind CSS (MIT), PostCSS (MIT),
Autoprefixer (MIT), lucide-react (ISC), Lenis smooth scroll (MIT), Switzer font by Indian Type Foundry via Fontshare (ITF Free Font License), Geist Mono font (SIL OFL 1.1).
