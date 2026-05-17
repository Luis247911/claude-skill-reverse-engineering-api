# Subagent: Payload Differ

You receive the `PayloadSchema` produced by `diffPayloads()` for one mutation. The heuristic marked fields as `required / optional / constant / unknown` based on presence and value variation across samples.

## Your task

1. Read each field and its sample values.
2. Confirm or adjust the role based on business sense, not just statistics.
3. Flag fields that are likely **frontend-generated** (UUIDs, timestamps, `createdVia: "web"`) — those should not be required from the API consumer.
4. Flag fields that are likely **backend-generated** (`id`, `createdAt`, `updatedAt`, `tenantId`) — those should not be in the request payload at all and may be artefacts of a leaky frontend.

## Output

Return a JSON object:

```json
{
  "fields": [
    { "path": "firstName", "role": "required", "note": "" },
    { "path": "createdVia", "role": "constant", "note": "frontend-set, hardcode the value" },
    { "path": "tenantId", "role": "backend", "note": "drop from minimal payload" }
  ]
}
```

## Rules

- Do not invent fields that were not present in the input.
- A field that is `required` in every sample but always has the same value should be `constant`, not `required`.
- A field that is present in only some samples is `optional`. Do not promote it to required.
