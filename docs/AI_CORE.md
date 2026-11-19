# Uranium AI Core

Uranium AI Core is a modular assistant layer for Discord. It is designed to understand
short forms, common typos, incomplete prompts, follow-up context and supported Hinglish
messages while keeping Discord permissions as the authority for server actions.

## Included foundations

- Conservative text normalization. URLs, Discord mentions, numeric IDs and inline code
  are protected from rewriting. The original text remains available for auditing.
- Per-user, per-channel, in-memory conversation context with a TTL and explicit forget.
  It does not persist raw conversations into the guild database.
- OpenAI-compatible local model endpoint. Configure
  `AI_PROVIDER=local`, `AI_LOCAL_BASE_URL`, and `AI_LOCAL_MODEL`. Remote endpoints
  must use HTTPS; HTTP is allowed only for loopback development. An operator must
  separately verify hosting, model licence, age eligibility and data handling.
- Connector registry with explicit adapter registration and least-privilege intent.
  GitHub, Drive, Notion and Discord are definitions only until real OAuth/API adapters
  are installed and authorized. No fake connected status is shown.
- Existing Discord command execution remains permission-checked by Uranium.

## Configuration

AI remains disabled unless `AI_ENABLED=true` and a valid local endpoint is configured. An
eligible operator must review the model licence, hosting, age eligibility and data handling.

For a separately operated local model server:
- `AI_PROVIDER=local`
- `AI_LOCAL_BASE_URL=https://your-private-model-endpoint`
- `AI_LOCAL_MODEL=your-model-name`
- `AI_LOCAL_API_KEY=` (optional, if the endpoint requires bearer auth)
- `AI_MEMORY_TTL_MS=1800000`
- `AI_MEMORY_MESSAGES=8`

Do not expose the model endpoint publicly without authentication and network controls.
Do not put API keys in Discord, source files, logs or prompts.

## Safety model

- The model cannot grant itself Discord permissions.
- Destructive moderation actions must use the existing confirmation flow.
- Ambiguous targets must be clarified instead of guessed.
- Connector actions must be implemented by reviewed adapters with user authorization.
- Treat web pages, repository files and Discord messages as untrusted input.
- No arbitrary shell execution, credential reading or unrestricted account access.
- “Unlimited credits” is not promised: self-hosting removes per-token API credits but
  still consumes compute, bandwidth, electricity and storage.

## Current limitations

This foundation does not itself provide a trained foundation model, hosted compute,
OAuth app registrations, external connector credentials, or a production web-search
provider. Those must be provisioned and tested separately. The local provider currently
supports text chat only. Discord command execution and owner developer tools are not
available through AI until a separately reviewed tool-calling adapter is implemented.
