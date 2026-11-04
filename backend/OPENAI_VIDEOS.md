# OpenAI-compatible Video API

OpenAI platform groups can proxy asynchronous video APIs through OpenAI API Key accounts that expose a compatible `/v1/videos` endpoint.

| Operation | Endpoint |
| --- | --- |
| Submit a video task | `POST /v1/videos` |
| Submit alias | `POST /v1/video/generations` |
| Query task | `GET /v1/videos/{id}` |
| Download content | `GET /v1/videos/{id}/content` |

The same routes are available without the `/v1` prefix. The existing Grok routes, including `/v1/videos/generations`, edits, extensions, and their status paths, continue using xAI's native protocol.

## Account and group setup

Use an OpenAI API Key account with its upstream base URL and API key configured. Enable the account's `videos` endpoint capability when its `openai_capabilities` list is explicitly restricted. Accounts without an explicit capability list remain eligible by default. OAuth accounts are not selected for this endpoint.

Add the account to an OpenAI group and enable the group's existing media-generation permission. Configure a video price for the requested resolution, a group model price in video mode, or a channel model price in video, per-request, or image mode. Token-only pricing does not satisfy video pricing checks. In simple run mode the price check is skipped. The gateway does not retry a video submission after an ambiguous upstream transport failure because the provider may already have accepted and started the task.

JSON and `multipart/form-data` submissions are passed through. The gateway reads `model`, `prompt`, `seconds` (or `duration`), and `resolution` (or `size`) for routing and billing; model mappings are applied to either request format while other fields are preserved.

## Task ownership and billing

After the upstream accepts a task, its ID is bound in Redis to the selected account, scoped by API key and group, for seven days. Status and content requests use that account instead of selecting another provider account. A task submitted with another API key is not visible through the current key. A Redis binding write failure is logged while the accepted upstream response is preserved.

Usage is recorded once after successful task submission, using the upstream account and task ID for billing deduplication. Status checks and content downloads are not billed again. Content responses preserve range and cache headers and stream the upstream body. Video duration is not capped at Grok's 15-second billing limit for other OpenAI-compatible providers.

```bash
curl "$RELAY_BASE_URL/v1/videos" \
  -H "Authorization: Bearer $RELAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"video-model","prompt":"A paper boat on a pond","seconds":6,"size":"1280x720"}'

curl "$RELAY_BASE_URL/v1/videos/$VIDEO_TASK_ID" \
  -H "Authorization: Bearer $RELAY_API_KEY"

curl "$RELAY_BASE_URL/v1/videos/$VIDEO_TASK_ID/content" \
  -H "Authorization: Bearer $RELAY_API_KEY" \
  -H 'Range: bytes=0-' \
  -o video.mp4
```
