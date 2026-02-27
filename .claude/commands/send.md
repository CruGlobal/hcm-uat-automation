---
name: send
description: Send an email via Gmail with optional attachments
---

You are helping the user send an email via the Gmail API. Follow these steps:

## Step 1: Determine the Recipient

The user may provide a recipient as an argument (e.g., `/send julianne` or `/send josh.starcher@cru.org`).

**Known contacts:**
- **julianne** → julianne.hope@cru.org
- **josh** → josh.starcher@cru.org

If the argument matches a known contact name (case-insensitive), use their email address.
If the argument contains `@`, use it as-is.
If no argument is provided, ask the user who to send the email to.

## Step 2: Determine Subject and Body

Infer the subject and body from conversation context when possible:
- If the user recently generated a report, analysis, or output — summarize it
- If there's an obvious topic being discussed — use it as the subject
- If the context is ambiguous, ask the user for the subject and body

Keep the body concise and professional. Use plain text (not HTML).

## Step 3: Determine Attachments

Check if there are files the user likely wants to attach:
- Files recently created or exported in the conversation (e.g., CSV, Excel, PDF files in `tmp/`)
- Files the user explicitly mentions

If no attachments are obvious, proceed without them. Do NOT ask about attachments unless the context strongly suggests files should be attached.

## Step 4: Confirm Before Sending

Before sending, show the user a summary:
```
To: recipient@example.com
Subject: ...
Body: (first few lines)
Attachments: file1.csv (if any)
```

Ask for confirmation to send.

## Step 5: Send the Email

Run an inline Python script using `uv run --with google-auth --with google-api-python-client python -c '...'` to send the email.

The script must:
1. Load OAuth credentials from `~/.config/gcloud/gmail_token.json`
2. Build the Gmail API service
3. Create and send the message (with attachments if any)

### Without Attachments

```bash
uv run --with google-auth --with google-api-python-client python -c "
import json, base64
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('$HOME/.config/gcloud/gmail_token.json', ['https://www.googleapis.com/auth/gmail.send'])
service = build('gmail', 'v1', credentials=creds)

msg = MIMEText('''BODY_TEXT_HERE''')
msg['to'] = 'RECIPIENT_HERE'
msg['subject'] = 'SUBJECT_HERE'

raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
result = service.users().messages().send(userId='me', body={'raw': raw}).execute()
print(f\"Sent! Message ID: {result['id']}\")
"
```

### With Attachments

```bash
uv run --with google-auth --with google-api-python-client python -c "
import json, base64, mimetypes, os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('$HOME/.config/gcloud/gmail_token.json', ['https://www.googleapis.com/auth/gmail.send'])
service = build('gmail', 'v1', credentials=creds)

msg = MIMEMultipart()
msg['to'] = 'RECIPIENT_HERE'
msg['subject'] = 'SUBJECT_HERE'
msg.attach(MIMEText('''BODY_TEXT_HERE'''))

for filepath in [ATTACHMENT_PATHS_HERE]:
    content_type, _ = mimetypes.guess_type(filepath)
    if content_type is None:
        content_type = 'application/octet-stream'
    main_type, sub_type = content_type.split('/', 1)
    with open(filepath, 'rb') as f:
        part = MIMEBase(main_type, sub_type)
        part.set_payload(f.read())
    encoders.encode_base64(part)
    part.add_header('Content-Disposition', 'attachment', filename=os.path.basename(filepath))
    msg.attach(part)

raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
result = service.users().messages().send(userId='me', body={'raw': raw}).execute()
print(f\"Sent! Message ID: {result['id']}\")
"
```

Replace the placeholder values (`RECIPIENT_HERE`, `SUBJECT_HERE`, `BODY_TEXT_HERE`, `ATTACHMENT_PATHS_HERE`) with actual values. For attachment paths, use a Python list of strings like `['/path/to/file1.csv', '/path/to/file2.pdf']`.

## Step 6: Report Result

Confirm to the user:
- Email was sent successfully
- Message ID
- Recipient address
- Whether attachments were included

If the send fails, report the error. Common issues:
- Token expired — tell the user to re-authenticate
- File not found — for attachment issues
- Permission denied — scope issues with the token

## IMPORTANT

- The Gmail OAuth token is at `~/.config/gcloud/gmail_token.json`
- Always confirm with the user before sending
- Use plain text for email bodies, not HTML
- Do NOT store email content in files — use inline Python only
- The `uv run --with` approach avoids needing a separate script file
