# Privacy Contract

This kit is designed to be used **privately** on your own machine and **published** to GitHub from the same folder. The two modes must not contaminate each other.

## What is tracked vs ignored

| Folder | Tracked in Git? | Reason |
|--------|-----------------|--------|
| `src/`, `tests/`, `docs/`, `samples/public/` | Yes | Kit source, demos, methodology |
| `methode.txt`, `README.md`, `LICENSE`, `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` | Yes | Public infrastructure |
| `captures/` | No (except `.gitkeep`) | Live capture runs may contain auth, tenant data, real user records |
| `out/` | No (except `.gitkeep`) | Generated clients per run may embed endpoint paths and field names from private systems |
| `scope/` | No (except `.gitkeep`) | Your scope notes per run may name internal projects or customers |
| `*.har` outside `samples/public/` | No | HAR files always carry headers/cookies/bodies |
| `*.cookies`, `*.token`, `*.jwt`, `*.private.json` | No | Raw auth material |
| `secrets/` anywhere | No | Last-resort catch-all |
| `.env` | No | Environment-specific configuration |

## What the sanitizer does at runtime

Before any capture is written to disk under `captures/`, the sanitizer (`src/capture/sanitizer.ts`) replaces:

- `Authorization`, `Cookie`, `Set-Cookie`, `X-CSRF-Token`, `X-Api-Key` header values → `<REDACTED:...>`
- Values matching JWT shape (`xxx.yyy.zzz` base64-ish) → `<REDACTED:JWT>`
- Email-shaped values in payloads and responses → `<REDACTED:EMAIL>`
- Common ID-shaped fields if requested (`opt-in` per run)

You can keep an unredacted copy if you opt in explicitly, but the default is always redacted. The redacted file is the only one the orchestrator reads after capture.

## Recommended workflow before pushing

```bash
git status                       # nothing from captures/, out/, scope/?
git check-ignore -v captures/*   # confirm ignore
git diff --staged                # last visual check
```

If you ever accidentally stage a capture, `git restore --staged <path>` will unstage it. If a capture was committed locally but not pushed, rewrite the commit (`git reset HEAD~1`) before pushing.

## Public samples

Curated HARs against open sandboxes (e.g. `jsonplaceholder.typicode.com`, `dummyjson.com`) live in `samples/public/` and ARE tracked. They are used by the demo and end-to-end tests. Only add files there that you know are safe to publish.
