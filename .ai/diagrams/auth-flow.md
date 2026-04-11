# מהמקור — Auth flow

> Mermaid diagrams for the auth surface: consumer/producer registration,
> login, Google OAuth, Apple OAuth, JWT lifecycle, and role-gated
> dependencies. Designed to be loaded into every Claude Code session via
> `--append-system-prompt "$(cat .ai/diagrams/*.md)"` so I start with
> architecture context without needing to re-read files.
>
> **Ground truth:** `backend/app/routers/auth.py` + `backend/app/auth.py`
> (see `docs/DATA.md` endpoints table). If the diagrams drift from the
> code, the code wins — update the diagram.

## 1. Registration — three paths, three endpoints

```mermaid
flowchart TD
    Start([New user lands on /register]) --> Choice{Consumer or<br/>business owner?}

    Choice -->|Consumer — default| ConsumerForm[/register page.js]
    ConsumerForm --> CP[POST /auth/register]
    CP --> CreateConsumer[Create User<br/>role=consumer]
    CreateConsumer --> IssueJWTc[create_access_token user.id]
    IssueJWTc --> ReturnTokenC[Return Token<br/>access_token 24h]

    Choice -->|Business owner — multi-step| ProducerForm[/register/producer page.js<br/>4 steps: account → business → delivery → consents]
    ProducerForm --> PP[POST /auth/register/producer]
    PP --> TxBegin[DB transaction]
    TxBegin --> CreateProducer[Create Producer<br/>status=pending]
    CreateProducer --> CreateUser[Create User<br/>role=producer<br/>producer_id=new producer.id]
    CreateUser --> LinkCats[Link producer_categories + delivery_areas]
    LinkCats --> TxEnd[Commit tx]
    TxEnd --> NotifyAdmin[Optional: Twilio WhatsApp + SMTP<br/>admin notification<br/>fail-open on missing config]
    NotifyAdmin --> IssueJWTp[create_access_token user.id]
    IssueJWTp --> ReturnTokenP[Return Token<br/>access_token 24h]

    Choice -->|OAuth one-click| OAuthChoice{Google or Apple?}
    OAuthChoice -->|Google| GoogleFlow[POST /auth/google<br/>body: id_token]
    OAuthChoice -->|Apple| AppleFlow[POST /auth/apple<br/>body: identity_token<br/>required for App Store]
    GoogleFlow --> VerifyG[google-auth:<br/>verify id_token against<br/>GOOGLE_CLIENT_ID]
    AppleFlow --> VerifyA[PyJWT:<br/>verify identity_token against<br/>Apple public keys + APPLE_CLIENT_ID]
    VerifyG --> UpsertG[Upsert User by google_id<br/>role=consumer]
    VerifyA --> UpsertA[Upsert User by apple_id<br/>role=consumer]
    UpsertG --> IssueJWTo[create_access_token user.id]
    UpsertA --> IssueJWTo
    IssueJWTo --> ReturnTokenO[Return Token<br/>access_token 24h]

    ReturnTokenC --> Client[Frontend stores JWT<br/>in auth-context]
    ReturnTokenP --> Client
    ReturnTokenO --> Client
```

## 2. Login — single endpoint, rate-limited

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend<br/>app/login/page.js
    participant BE as Backend<br/>POST /auth/login
    participant DB as PostgreSQL

    U->>FE: email + password
    FE->>BE: POST /auth/login<br/>{email, password}
    Note over BE: slowapi: 5/minute per IP
    BE->>DB: SELECT User WHERE email=?
    alt User not found
        BE-->>FE: 401 Invalid credentials
    else is_blocked=true
        BE-->>FE: 403 Account blocked
    else password mismatch
        BE-->>FE: 401 Invalid credentials
    else all good
        BE->>BE: create_access_token(user.id)<br/>HS256, 24h exp, JWT_SECRET_KEY
        BE-->>FE: {access_token, token_type: "bearer"}
        FE->>FE: store in auth-context<br/>+ localStorage
    end
```

## 3. JWT verification + role gates on every authenticated request

```mermaid
flowchart LR
    Request[Incoming HTTP request] --> Header{Has<br/>Authorization<br/>Bearer header?}
    Header -->|No| NoAuth[get_current_user_optional<br/>returns None]
    NoAuth --> Anonymous[Anonymous route continues<br/>e.g. GET /producers]

    Header -->|Yes| Decode[jose.jwt.decode<br/>JWT_SECRET_KEY, HS256]
    Decode -->|Invalid/expired| Raise401[HTTPException 401]
    Decode -->|Valid| LoadUser[SELECT User WHERE id=sub]
    LoadUser -->|Not found| Raise401b[HTTPException 401]
    LoadUser -->|Found| BumpLastActive[_maybe_bump_last_active<br/>throttled 5 min<br/>feeds /admin DAU chart]

    BumpLastActive --> RoleDep{Which dep<br/>was called?}
    RoleDep -->|get_current_user| Pass[Return User]
    RoleDep -->|require_producer| ProdCheck{user.role ==<br/>producer?}
    RoleDep -->|require_admin| AdminCheck{user.role ==<br/>admin?}

    ProdCheck -->|yes| Pass
    ProdCheck -->|no| Raise403p[HTTPException 403<br/>Producer access required]
    AdminCheck -->|yes| Pass
    AdminCheck -->|no| Raise403a[HTTPException 403<br/>Admin access required]

    Pass --> Handler[Route handler runs<br/>with User object]
```

## 4. JWT lifecycle + secret loading (CLAUDE.md locked decision)

```mermaid
flowchart TD
    Start[Backend boot] --> LoadEnv{JWT_SECRET_KEY<br/>env var set?}
    LoadEnv -->|Yes| UseEnv[settings.secret_key = env value]
    LoadEnv -->|No| CheckProd{ENV ==<br/>production?}
    CheckProd -->|Yes| FailFast[RuntimeError:<br/>refuse to start<br/>SECURITY FIX #1]
    CheckProd -->|No / dev| Ephemeral[Generate ephemeral<br/>secrets.token_hex 32<br/>+ loud warning log]

    UseEnv --> Tokens[Used for both:<br/>1 JWT sign/verify<br/>2 analytics IP hash salt]
    Ephemeral --> Tokens

    Tokens --> TTL[Token TTL = 24h<br/>ACCESS_TOKEN_EXPIRE_MINUTES=1440<br/>no refresh token, re-login daily]
    TTL --> Rotation[Rotate secret →<br/>invalidates all tokens +<br/>resets analytics hash salt]
```
