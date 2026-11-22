# Vetted: architecture

```mermaid
flowchart TB
    subgraph IN[Request]
        UI[Web app<br/>React]:::ui
        CLI[CLI]:::ui
    end
    UI -->|POST /api/runs| API
    CLI --> RUN

    subgraph SVC[Vetted service]
        API[FastAPI<br/>resumes unfinished runs on start-up]:::svc
        RUN[Checkpointed runner<br/>time + cost limit guard]:::svc
        POL[(policy.yaml<br/>rules, limits, prices)]:::store
        API --> RUN
        POL -. re-read every run .-> RUN

        subgraph STEPS[Pipeline steps, each saved when done]
            S1[1 Read request]
            S2[2 Duplicate check]
            S3[3 Find company + lookalike]
            S4[4 Company profile]
            S5[5 Registry record]
            S6[6 Website check]
            S7[7 GSTIN + IFSC]
            S8[8 Who runs it]
            S9[9 News screen + namesakes]
            S10[10 Source check]
            S11[11 Decision]
            S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8 --> S9 --> S10 --> S11
        end
        RUN --> STEPS

        CL[Data clients<br/>retries + backoff · 429 wait · 402 stop<br/>timeout = 'unavailable', never 'no record'<br/>response cache]:::svc
        STEPS --> CL

        OUT[Approval queue<br/>approve / hold / block<br/>named approver]:::human
        EX[Action executor<br/>outbox + idempotency keys<br/>reconciles after a crash]:::svc
        S11 --> OUT --> EX
    end

    subgraph DATA[Live sources]
        CD[Crustdata API<br/>company identify · company enrich<br/>web search · web fetch]:::ext
        REG[MCA company records<br/>InstaFinancials · Tofler · companydetails.in]:::ext
        IFSC[Razorpay IFSC directory]:::ext
        LLM[Groq LLM<br/>reads free-text requests only]:::ext
        SITE[Vendor website]:::ext
    end
    CL --> CD & REG & IFSC & LLM & SITE

    subgraph DB[SQLite, WAL]
        T1[(runs + steps<br/>checkpoints)]:::store
        T2[(cache)]:::store
        T3[(calls<br/>COST LEDGER)]:::store
        T4[(actions<br/>outbox)]:::store
        T5[(vendor master)]:::store
    end
    RUN <--> T1
    CL <--> T2
    CL --> T3
    OUT <--> T4
    EX --> T5
    S2 --> T5
    EX --> MAIL[Email to the vendor<br/>teammate inbox in the demo]:::ext

    classDef ui fill:#E5F1EA,stroke:#17603F,color:#14201A
    classDef svc fill:#FFFFFF,stroke:#56625B,color:#14201A
    classDef ext fill:#F7F6F2,stroke:#56625B,color:#14201A,stroke-dasharray:4 3
    classDef store fill:#ECEFF1,stroke:#3F4B54,color:#14201A
    classDef human fill:#FBF0D9,stroke:#7A4E00,color:#14201A
```

## Where things sit

| Concern | Where |
|---|---|
| Data calls | `vetted/clients/crustdata.py`, `vetted/clients/registry.py`, `vetted/idchecks.py`, `vetted/clients/llm.py` |
| Retries | every client: backoff on timeouts and 5xx, wait on 429 using `x-ratelimit-reset`, stop on 402 |
| Cost ledger | `calls` table: provider, endpoint, outcome, credits (`X-Credits-Used`), tokens, ₹, duration; shown live in the UI |
| Limits | `RunContext.check_budget()` before every paid call (`policy.yaml` → `limits`) |
| Approvals | `actions` table, `vetted/actions.py`; UI *Approvals* page; every verdict records the approver |
| Exactly once | idempotency key per action, atomic claim (`approved → executing`), reconcile on restart |
| Resume after a kill | `steps` table checkpoints + response cache; API resumes `running` runs on start-up |
| Evidence | `vetted/evidence.py`: fact = value + source + URL + passage/field + record date + retrieval date; source check |
