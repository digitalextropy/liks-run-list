# Backups

Point-in-time snapshots of data stored in Vercel Blob, captured before significant refactors.

## Restore

To restore a backup to Vercel Blob, use the application's existing save endpoints:

- **Rules:** `PUT /api/rules` with the JSON body
- **Recipes:** parsed recipes are saved automatically by `/api/recipes/parse`; to force-restore, upload the underlying PDF or call `saveParsedRecipes` directly

## Snapshots

| File | Date | Captured before | Source |
|---|---|---|---|
| `rules-2026-05-27.json` | 2026-05-27 | Deterministic engine refactor | `GET /api/rules` |
| `recipes-2026-05-27.json` | 2026-05-27 | Deterministic engine refactor | `GET /api/recipes/parse` (cached PDF parse, 111 recipes) |

## Companion git tag

`v1-pre-deterministic` on commit `9ff86f3` — last known good state of the per-machine parallel Claude generation path with footer-correction post-processing.

Restore code with: `git checkout v1-pre-deterministic`
