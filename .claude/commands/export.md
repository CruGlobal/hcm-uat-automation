---
name: export
description: Export a migration table, encrypt it, and upload to Google Drive
---
You are helping the user export a migration table, encrypt it as a .psv.gpg file, and upload it to Google Drive for eVerge validation. Follow these steps:

## Step 1: Determine the table name

The user may provide the table name as an argument (e.g., `/export payment_method`). If no argument is provided, ask the user which table to export.

The argument is the base table name without the `migration.` schema prefix. Common tables:
- `payment_method`
- `assignment`
- `payroll_relationships`
- `payroll_balances`

## Step 2: Run download_and_encrypt.sh

Run the export and encryption script from the project root:

```bash
bash download_and_encrypt.sh <table_name>
```

This will:
1. Export the table to a CSV file in `tmp/`
2. Convert CSV to pipe-separated values (PSV)
3. Encrypt the PSV file with GPG
4. Clean up intermediate files

If the script fails, report the error and stop.

## Step 3: Identify the output file

The script outputs the `.psv.gpg` filename. Extract it from the output (it will be in `tmp/` with a timestamp, e.g., `tmp/payment_method_20260129_133132.psv.gpg`).

## Step 4: Upload to Google Drive

Upload the encrypted file using the upload tool:

```bash
uv run upload-to-drive <path_to_psv_gpg_file>
```

This uploads to the shared Google Drive folder for eVerge validation.

## Step 5: Report results

Tell the user:
- Table name and row count (from export output)
- The local file paths (CSV for reference, .psv.gpg encrypted)
- Confirmation of successful upload with the Drive folder link

## IMPORTANT

- Always run from the project root directory
- The export script requires database connectivity (Oracle)
- The upload script requires Google Drive OAuth credentials at `~/.config/gcloud/drive_credentials.json`
- Do NOT delete the local CSV file - it's kept for reference
- Do NOT commit the tmp/ files to git
