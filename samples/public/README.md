# Public sample captures

HAR files in this folder are committed to Git and shipped with the kit. They MUST only come from open, public sandboxes (no auth, no real user data).

## `jsonplaceholder.har`

Four requests against `jsonplaceholder.typicode.com`:

1. `GET /users` — list users (lookup)
2. `POST /posts` — first create (mutation)
3. `POST /posts` — second create (mutation, used for payload-diff variation)
4. `PATCH /posts/101` — update (mutation with path parameter)

Used by the end-to-end demo in `tests/e2e/jsonplaceholder.test.ts`.
