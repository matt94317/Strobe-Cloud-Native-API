# Strobe → AWS Serverless Migration Plan

CAB432 Assessment 1 — Cloud-Native API (30 marks, individual, weighted 30% of final grade)

Server implementation used: **Strobe Server JS** (`CAB432-Strobe-Server-Js-1.0.0`) — this is the only server variant present in the workspace, so the plan below is written against it. Node.js Lambda runtime target: **24.x** (the AWS console's "Author from scratch" runtime dropdown no longer offers 20.x).

---

## Progress Checklist

Check items off as you complete and verify them. Mirrors the phases in section 2 below.

### Phase 0 — AWS foundations

- [x] Confirm region (ap-southeast-2) and resource-naming prefix (student ID)
- [x] Create Cognito user pool (skeleton)
- [x] Create S3 bucket (skeleton)
- [x] Create 6 DynamoDB tables (skeleton)
- [x] Create 6 Lambda shells
- [x] Create API Gateway HTTP API
- [x] Request ACM certificate
- [x] Create Route 53 record
- [x] Start filling `submission-infra.yml` / `submission-routes.yml` incrementally

### Phase 1 — Identity: Cognito

- [x] Create Cognito user pool (`n<id>-strobe-users`), email as username/alias
- [x] Set password policy compatible with `validatePassword` (min length 6, no complexity requirements)
- [x] Configure email via Amazon SES, source `noreply@cab432.com`
- [x] Create app client, no client secret, enable `ALLOW_USER_PASSWORD_AUTH` + `ALLOW_ADMIN_USER_PASSWORD_AUTH`
- [x] Set access/ID token validity ≤ 24h
- [x] Create `moderators` group
- [x] Rewrite `registerUser` in `authService.js` (Cognito SignUp + DynamoDB row)
- [x] Rewrite `loginUser` in `authService.js` (Cognito InitiateAuth)
- [x] Rewrite `authenticate()` middleware (JWKS verification via `aws-jwt-verify`)
- [x] Rewrite `deleteUserAccount` (AdminDeleteUser)
- [x] Pre-create + confirm test account, add to `moderators` group

### Phase 2 — Data: DynamoDB

- [x] Create 6 DynamoDB tables with partition key `id`
- [x] Enable PITR with 7-day retention on every table
- [x] Rewrite `userModel.js` to use DynamoDB Document Client
- [x] Rewrite `postModel.js`
- [x] Rewrite `commentModel.js`
- [x] Rewrite `likeModel.js`
- [x] Rewrite `followModel.js`
- [x] Rewrite `momentModel.js`
- [x] Delete `src/config/database.js` + `db.json`
- [x] Add GSIs / bounded scans for search, feed, and follower/following queries

### Phase 3 — Storage: S3 presigned access

- [x] Create private S3 bucket, block all public access
- [x] Rewrite `uploadService.js`/`uploadController.js` for presigned PUT (≤ 5 min expiry)
- [x] Drop multer middleware + static `/uploads` serving
- [x] Rewrite `enrichment.js` for presigned GET URLs at read time
- [ ] ⚠️ Update Strobe Web frontend for the new upload flow (see flag in Phase 3 section below)

### Phase 4 — Compute: Lambda-ise the controllers

- [ ] `auth` Lambda
- [ ] `post` Lambda (post + comment routes)
- [ ] `feed` Lambda
- [ ] `user` Lambda (user + follow routes)
- [ ] `upload` Lambda
- [ ] `moment` Lambda
- [ ] Wrap each with `serverless-http`/`serverless-express`
- [ ] Per-function `package.json`/bundle
- [ ] Remove `app.listen()` + local-disk assumptions from Lambda code paths

### Phase 5 — Edge: API Gateway, Route 53, ACM

- [ ] Request + DNS-validate ACM cert for `n<id>.cab432.com`
- [ ] Create HTTP API with all routes, `$default` stage
- [ ] Create custom domain, attach cert, TLS 1.2 minimum
- [ ] Create Route 53 record
- [ ] Enable CORS

### Phase 6 — Integration test & tagging

- [ ] Tag every resource (`qut-username`, `purpose`)
- [ ] Point Strobe Web at deployed API, run full flow manually
- [ ] Re-run Insomnia collection against deployed domain
- [ ] Test moderator path (403 for non-mod, success for mod)

### Phase 7 — Submission YAML

- [ ] Fill `submission-infra.yml` completely
- [ ] Fill `submission-routes.yml` completely
- [ ] Double-check: no keys added/removed, every ARN resolves, every table/Lambda is genuinely distinct

---

## 1. Target Architecture

```
Browser (Strobe Web)
   │  HTTPS
   ▼
Route 53  (n12191434.cab432.com)
   │
   ▼
ACM certificate (TLS ≥1.2)
   │
   ▼
API Gateway (HTTP API, custom domain, $default stage)
   │  6 route groups, one Lambda integration per controller
   ├── /v1/auth/*                → Lambda: auth
   ├── /v1/posts/*, /v1/posts/{postId}/comments/* → Lambda: post
   ├── /v1/feed                  → Lambda: feed
   ├── /v1/users/*, /v1/users/{userId}/follow* → Lambda: user
   ├── /v1/uploads/url           → Lambda: upload
   └── /v1/moments/*             → Lambda: moment
                │
                ▼
        DynamoDB (6 tables: user, post, comment, like, follow, moment)
        S3 (1 bucket: media, private, presigned access only)
        Cognito (1 user pool + "moderators" group, SES email via noreply@cab432.com)
        CloudWatch Logs (Lambda logging only)
```

Six Lambda functions (matching the **controller** column of the route table — this is deliberate and different from "one per entity"), six DynamoDB tables (matching the **entity** data model — `comment`, `like`, `follow` are separate tables even though the `post`/`user` Lambdas write to them). This split is exactly what `submission-infra.yml`'s sample (`lambdaARN` has 6 controller entries; `dynamoDBTableARNs` has 6 entity entries) and User Story 10's last bullet ("distinct per entity/controller") require — don't collapse either list.

---

## 2. Phased Plan

### Phase 0 — AWS foundations (no code)

- Confirm ap-southeast-2 as default region; agree on a resource-naming prefix using your student ID, e.g. `n12191434-` (must appear in every resource name; `qut-username`/`purpose` tags on every resource).
- In the shared CAB432 account, create the Cognito user pool, S3 bucket, 6 DynamoDB tables, 6 Lambda shells, API Gateway HTTP API, ACM cert, Route 53 record — this phase is just provisioning skeletons so later phases have targets to deploy into and ARNs to record.
- Start filling `submission-infra.yml` and `submission-routes.yml` incrementally as each ARN is created (don't leave this to the end — it's easy to lose track of which ARN belongs to which resource).

### Phase 1 — Identity: Cognito (User Stories 1, 3, 4, 5)

- Create a Cognito user pool (`n<id>-strobe-users`) with:
  - Email as the username/alias.
  - Password policy compatible with `validatePassword` in `src/utils/validation.js`.
  - **Email configuration → custom SES sender**, source `noreply@cab432.com` (not Cognito's default) — required per the assignment constraints and User Story 3's last acceptance criterion.
  - App client, **no client secret** (Lambda calls Cognito server-side, so a secret adds no security but complicates every call with an `HMAC` `SECRET_HASH`).
  - Access/ID token validity ≤ 24h (User Story 4).
  - A group, e.g. `moderators`, for privileged actions (User Story 5).
- Rewrite `src/services/authService.js` and `src/middleware/auth.js`:
  - `registerUser` → call Cognito `SignUp` (or `AdminCreateUser` + `AdminSetUserPassword` if you want to skip email verification complexity) to get a durable `sub`, **then** write the app-level row to the `user` DynamoDB table using that `sub` as `id`. Both must succeed — User Story 3 explicitly penalises "one but not the other." Duplicate registration must surface Cognito's `UsernameExistsException` as a 409, matching the existing `conflictError` pattern.
  - `loginUser` → call Cognito `InitiateAuth` (`USER_PASSWORD_AUTH`) or `AdminInitiateAuth`, return the Cognito access token instead of the hand-rolled JWT from `generateToken()`. Drop `bcrypt`/`comparePassword` — Cognito owns the password.
  - `authenticate()` middleware → verify the Cognito access/ID token (JWKS verification, e.g. `aws-jwt-verify`) instead of `jwt.verify(token, config.jwtSecret)`. Attach `req.userId` (Cognito `sub`), and pull `cognito:groups` for `req.userRole`/`requireModerator`.
  - `deleteUserAccount` → after removing the app-level row, call Cognito `AdminDeleteUser` so the identity is actually deprovisioned (User Story 5's third bullet).
- Pre-create and confirm a test account (`testUsername`/`testPassword`) via `AdminCreateUser` + `AdminSetUserPassword(Permanent: true)` + `AdminConfirmSignUp`, and add it to the `moderators` group via `AdminAddUserToGroup` — this account doubles as both the auth check (US4) and the privileged-action check (US5), so it must exist before any Gradescope run, not be created by the autograder itself.

### Phase 2 — Data: DynamoDB (all user stories touching persistence)

- Create 6 tables: `n<id>-ddb-users`, `-post`, `-comments`, `-likes`, `-follows`, `-moments` — partition key `id` (string) on each, matching the existing UUID-style IDs in `src/utils/idGenerator.js`.
- Enable **point-in-time recovery with a 7-day retention window** on every table (`PointInTimeRecoverySpecification` + `RecoveryPeriodInDays: 7` — the 35-day default fails User Story 9's last bullet if left unset).
- Rewrite the six model files (`src/models/userModel.js`, `postModel.js`, `commentModel.js`, `likeModel.js`, `followModel.js`, `momentModel.js`) to use the DynamoDB Document Client (`@aws-sdk/lib-dynamodb`) instead of `lowdb`. **Keep each exported function's name and signature identical** — `authService.js`, `postService.js`, etc. call these models and should need zero changes if the model interface is preserved. This is the highest-leverage refactor: it isolates all AWS-specific code behind the existing model layer.
- Delete `src/config/database.js` (`initialiseDatabase`/`getDatabase`/`saveDatabase` and the `db.json` file) once every model no longer references it.
- Watch for queries that assumed full-table scans over an in-memory array (e.g. `userModel.searchUsers`, feed generation, follower/following lookups) — these need either a DynamoDB `Query` on a GSI (e.g. GSI on `post.userId`, `comment.postId`, `follow.followerId`/`followeeId`, `like.postId`) or, given the scale of a course assignment, a bounded `Scan` + filter. Prefer GSIs where the access pattern is a simple equality lookup (they're required for `GET /v1/posts/user/{userId}`, `GET /v1/posts/{postId}/comments`, `GET /v1/users/{userId}/followers|following`, `GET /v1/moments/feed`).

### Phase 3 — Storage: S3 presigned access (User Stories 7, 8, 9)

- Create one private bucket (`n<id>-strobe-media`), **block all public access** at the bucket level (US9 first bullet).
- Rewrite `src/services/uploadService.js` / `src/controllers/uploadController.js`: replace `multer` disk storage with `POST /v1/uploads/url` issuing a presigned `PutObjectCommand` URL scoped to a specific key (e.g. `{userId}/{uuid}.jpg`), **expiring in ≤5 minutes** (US7 first bullet). The client uploads directly to S3 with this URL — no AWS credentials ever reach the browser.
- Drop `src/middleware/upload.js` (multer) and the static `/uploads` file serving in `src/index.js` — images are no longer served from local disk.
- Rewrite `src/utils/enrichment.js` so post/moment image fields are resolved to **presigned GET URLs at read time** (short expiry, e.g. 5–15 min) rather than the permanent `http://localhost:3000/uploads/...` links currently stored — DynamoDB should store the **S3 key**, not a public URL (US8 third bullet, US9 second bullet).

> **⚠️ Flag — frontend not yet updated.** `POST /v1/uploads/url` now returns an extra `key` field alongside `uploadUrl`/`fileId`, and accepts an optional `contentType` in the request body. The old `PUT /v1/uploads/:userId/:postId/:fileId` route is gone — the client must `PUT` the file bytes directly to the presigned `uploadUrl` (straight to S3, with a matching `Content-Type` header) instead of to our server, then send the returned `key` (not a URL) back in `images`/`imageUrl` when creating a post or moment. Strobe Web (`CAB432-Strobe-Web-1.0.0`) still assumes the old server-relayed upload flow and has not been touched — update it before Phase 6 end-to-end testing, or the upload flow will break in the browser even though the API itself works (verified directly against S3).

### Phase 4 — Compute: Lambda-ise the controllers (User Story 10, supports all)

- Group routes into 6 Lambda entry points matching `src/routes/*.js`'s mounting in `src/index.js`:
  - `auth` ← `authRoutes.js`
  - `post` ← `postRoutes.js` + `commentRoutes.js` (mounted under posts)
  - `feed` ← `feedRoutes.js`
  - `user` ← `userRoutes.js` + `followRoutes.js` (mounted under users)
  - `upload` ← `uploadRoutes.js`
  - `moment` ← `momentRoutes.js`
- Simplest path that reuses almost all existing Express code as-is: wrap each controller's sub-app with `serverless-http` (or `@codegenie/serverless-express`), so `index.js` per Lambda is a thin adapter — the existing `express.Router()` files, controllers, services, and middleware don't need to know they're running in Lambda.
- Each Lambda needs its own `package.json`/bundle (esbuild or a per-function `node_modules`) — keep dependencies minimal per function (e.g. the `upload` Lambda doesn't need the Cognito SDK).
- Remove `app.listen()` bootstrapping and local-disk assumptions (`config.uploadsDir`) from the Lambda code paths; keep `src/middleware/errorHandler.js` as-is, it's framework-agnostic.
- Runtime: Node.js 24.x. Memory/timeout: start at 256MB/10s, tune after testing.

### Phase 5 — Edge: API Gateway, Route 53, ACM (User Stories 1, 2)

- Request an ACM certificate (us-... no, ap-southeast-2, since this is a regional HTTP API custom domain) for `n<id>.cab432.com`, validate via the shared Route 53 hosted zone (DNS validation).
- Create the HTTP API, one route per row in the assignment's route table (each `ANY`/method + path pointing at the matching Lambda's proxy integration), stage `$default` (auto-deploy).
- Create the custom domain name on the API Gateway, attach the ACM cert, set minimum TLS security policy to `TLS_1_2`.
- Create the Route 53 `A`/`ALIAS` record for `n<id>.cab432.com` → the API Gateway custom domain's regional target.
- Enable CORS on the HTTP API (or per-route) so Strobe Web, pointed at `https://n<id>.cab432.com`, can call it from the browser.

### Phase 6 — Integration test & tagging pass (User Story 10)

- Tag **every** resource (Cognito pool, S3 bucket, 6 DynamoDB tables, 6 Lambdas, API Gateway, ACM cert) with `qut-username=<studentID>@qut.edu.au` and `purpose=assessment 1`.
- Point Strobe Web (`.env` / vite config, `http://localhost:3000` → `https://n<id>.cab432.com`) at the deployed API and manually run the full flow: register → login → create post → upload image → follow another user → comment → like → moment. Confirm each step lands in the right DynamoDB table (spot-check via console or CLI `get-item`).
- Re-run the provided Insomnia collection (`<server>/insomnia/strobe-openapi.yaml`) against the deployed domain end-to-end.
- Test the moderator path specifically: log in as a non-privileged user and confirm `POST /v1/posts/:id/hide` is rejected (403); log in as the test account (in the `moderators` group) and confirm it succeeds.

### Phase 7 — Submission YAML

- Fill `submission-infra.yml`: all six `dynamoDBTableARNs` entries (tagged by entity), `dynamoDBPostsTableARN` (special-cased, must equal the `post` entry), `s3MediaStoreARN`, `cognitoARN`, `certificateARN`, `apiRoute53Record` (bare `n<id>.cab432.com`, no protocol/trailing slash), `apiGatewayExecutionARN` + `apiGatewayStageARN` (hand-constructed — see the PDF's format, substitute your API ID and stage name), all six `lambdaARN` entries, and `metaData.qutUsernameTag`/`testUsername`/`testPassword`. Fill `studentDetail`.
- Fill `submission-routes.yml`: for every pre-filled route, complete `apiGatewayRoute`, `lambdaARN`, and `storage` (primary table/bucket) — don't add or remove routes.
- Double check: no keys added/removed from either template, every ARN resolves to a real resource in `ap-southeast-2`, every DynamoDB table is a genuinely distinct physical table (no aliasing two entities to one table), every controller is a genuinely distinct Lambda (no single monolithic function behind every route).

---

## 3. Marks Map (sanity check before submitting)

| User Story                      | Driven by                                                                   |
| ------------------------------- | --------------------------------------------------------------------------- |
| 1. Secure Public Access         | Phase 5 (ACM, custom domain, TLS≥1.2)                                       |
| 2. Meaningful Domain Access     | Phase 5 (Route 53 record)                                                   |
| 3. User Registration            | Phase 1 (Cognito SignUp + DynamoDB row, SES email)                          |
| 4. Authentication               | Phase 1 (Cognito InitiateAuth, token expiry, test account login)            |
| 5. Authorization & Account Mgmt | Phase 1 (moderators group, AdminDeleteUser)                                 |
| 6. Create Content               | Phase 2 (post/comment/like persistence)                                     |
| 7. Secure Image Upload          | Phase 3 (presigned PUT, ≤5min)                                              |
| 8. Content Retrieval            | Phase 3 (presigned GET, real persisted data)                                |
| 9. Secure Data Storage Design   | Phase 2 (PITR 7-day) + Phase 3 (bucket public-access block)                 |
| 10. End-to-End Integration      | Phase 4 (distinct Lambdas), Phase 6 (full flow), Phase 7 (routes.yml, tags) |

---

## 4. Key Risks / Things Not to Get Wrong

- **Don't modify the API contract.** Routes, request/response shapes, and status codes must stay identical to the provided server — Gradescope and Strobe Web both depend on it. All the migration work happens _behind_ the controllers, in the model/service/middleware layers.
- **Don't collapse Lambdas or tables for convenience.** A single monolithic Lambda or a shared DynamoDB table across entities fails User Story 10's explicit distinctness check.
- **PITR retention defaults to 35 days** — you must explicitly set `RecoveryPeriodInDays: 7` or lose 0.25 marks on a technicality.
- **Cognito's default email service has a shared low daily quota across the whole course account** — if you forget to wire the SES identity, registration may silently work locally in testing then fail during grading once the pool default quota is exhausted.
- **Presigned URL expiries are graded thresholds**, not suggestions: upload credential ≤5 min, and image retrieval must never be a permanent public link.
- **Test account must pre-exist and be confirmed + in the moderators group** before submission — it's used for both the auth check and the privileged-action check, so it can't be something the autograder creates on the fly.
