# Patterns

Condensed from `methode.txt`. Use this when you are reviewing a generated client and want to remember why a heuristic exists.

## The four questions per mutation

```text
1. Which request actually performs the action?
2. What data does that request need?
3. Which auth tokens and dynamic values are required?
4. In what order must requests be executed?
```

## Request kinds (heuristic in `request-classifier.ts`)

```text
Asset      .js / .css / .png / .svg / fonts / maps        -> skip
Analytics  /analytics, /track, /telemetry, /sentry, ...   -> skip
Auth       /login, /logout, /session, /oauth, /sso        -> infra, not business
Lookup     GET that returns business data                 -> source of IDs
Metadata   GET /me, /permissions, /form-schema, ...       -> source of constants
Mutation   POST / PATCH / PUT / DELETE                    -> the real work
```

## Payload role rules (`payload-diff.ts`)

```text
Field present in all samples, varies         -> required
Field present in some samples                -> optional
Field present in all samples, same value     -> constant
Field present in all samples, looks like ID  -> probably backend-generated
```

## Dynamic value heuristics (`dynamic-value-tracer.ts`)

```text
xxx.yyy.zzz base64-ish                       -> JWT     (per-session)
header X-CSRF-Token / X-XSRF-Token           -> CSRF    (per-session)
prefix_alnum (job_abc1234, user_xyz)         -> entity-id (stable)
UUID                                         -> entity-id or client-uuid
cookie 'session' / 'sid' / 'jsessionid'      -> session-cookie
query 'cursor' / 'next'                      -> cursor  (per-request)
```

## Origin trace rules (in priority order)

```text
1. Value appears in a previous response body -> previous-response
2. Value appears in a previous Set-Cookie    -> cookie
3. Value is a UUID never seen before          -> client-generated
4. Otherwise                                  -> unknown
```

## Error class mapping (`errors-gen.ts`)

```text
400 BadRequestError           422 UnprocessableEntityError
401 UnauthorizedError         429 RateLimitError
403 ForbiddenError            500 ServerError
404 NotFoundError             502 BadGatewayError
409 ConflictError             503 ServiceUnavailableError
```
