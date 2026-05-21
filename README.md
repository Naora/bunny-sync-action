# bunny-sync-action

> **Heads-up:** Bunny is working on an official CLI that will cover this use-case properly. I built this action because I needed it *now*; consider it a stop-gap until that CLI lands.

Synchronises a local directory to a [BunnyCDN Storage Zone](https://bunny.net/storage/). Only changed files (compared by SHA-256 checksum) are uploaded; untouched files are skipped.

## Usage

```yaml
- uses: Naora/bunny-sync-action@v1
  with:
    storage_zone_name: ${{ secrets.BUNNY_STORAGE_ZONE }}
    storage_access_key: ${{ secrets.BUNNY_ACCESS_KEY }}
    local_directory: ./dist
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `storage_zone_name` | ✅ | — | Name of the BunnyCDN Storage Zone |
| `storage_access_key` | ✅ | — | Access key for the Storage Zone |
| `local_directory` | ✅ | — | Local directory to sync |
| `remote_directory` | | `/` | Target directory inside the Storage Zone |
| `delete` | | `false` | Delete remote files not present locally |
| `region` | | `de` | Main storage region (`de`, `uk`, `ny`, `la`, `sg`, `se`, `br`, `jh`, `syd`) |
| `dry_run` | | `false` | Print planned operations without applying them |

## Outputs

| Output | Description |
|---|---|
| `sync_result` | Summary string — e.g. `Uploaded: 4, Deleted: 1` |

## Full example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Build
        run: npm ci && npm run build

      - name: Sync to BunnyCDN
        uses: Naora/bunny-sync-action@2026.05.21
        with:
          storage_zone_name: ${{ secrets.BUNNY_STORAGE_ZONE }}
          storage_access_key: ${{ secrets.BUNNY_ACCESS_KEY }}
          local_directory: ./dist
          remote_directory: /assets
          delete: true
          region: ny
```
