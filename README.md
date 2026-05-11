# @codeproxy/cli

> **中文版** → [README.zh-CN.md](./README.zh-CN.md)

**@codeproxy/cli** is a local proxy server that converts **any** Chat Completions or Anthropic Messages API into the **OpenAI Responses API** format. It lets Codex, Claude Code, or any Responses-API client use models from DeepSeek, GLM, Kimi, and more.

Built on [@codeproxy/core](https://github.com/codeproxy-ai/core).

## Quick Start

```bash
npx @codeproxy/cli --base-url https://api.deepseek.com/v1 \
  --model deepseek-v4-flash \
  --apikey sk-your-key
```

Point your Responses-API client at `http://127.0.0.1:8787`:

```bash
curl -N http://127.0.0.1:8787/v1/responses \
  -H 'content-type: application/json' \
  -H "authorization: Bearer \$API_KEY" \
  -d '{"model":"deepseek-v4-flash","input":"Hello!","stream":true}'
```

### With config file

```bash
npx @codeproxy/cli --config ./config.json
```

See [config.example.json](./config.example.json) for a full example.

#### Top-level fields

| Field | Type | Description |
|---|---|---|
| `version` | `string` | Config format version (currently `"1.0"`) |
| `currentUpstream` | `string` | Name of the upstream to use (must match a key in `upstreams`) |
| `headers` | `object` | Default headers applied to **all** upstreams (merged with per-upstream headers; per-upstream wins) |
| `reasoningEffort` | `string` | Default reasoning effort for all upstreams: `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `thinking` | `object` `|` `null` | Default thinking config for all upstreams. Anthropic format: `{"type": "enabled", "budget_tokens": 16384}`. Set to `null` to disable |
| `timeoutMs` | `number` | Default upstream request timeout in milliseconds |

#### Per-upstream fields

| Field | Type | Description |
|---|---|---|
| `baseUrl` | `string` | **Required.** Upstream endpoint URL |
| `apiKey` | `string` | Upstream API key. Sent as `Authorization: Bearer <key>` (Anthropic: rewritten to `x-api-key`) |
| `model` | `string` | Override the `model` field in all incoming requests |
| `apiVersion` | `string` | Override `anthropic-version` header (Anthropic only) |
| `headers` | `object` | Extra HTTP headers for this upstream. Merged on top of top-level `headers`, per-upstream wins |

| `dropImages` | `boolean` | When `true`, strip image/file parts from user messages (for text-only models). Use with `fallback` to auto-route image requests to a vision-capable upstream |
| `fallback` | `string` | Name of another upstream to route to when `dropImages: true` and the request contains images |
| `reasoningEffort` | `string` | Per-upstream reasoning effort override (`"low"`, `"medium"`, `"high"`, `"xhigh"`). Overrides top-level value |
| `thinking` | `object` `|` `null` | Per-upstream thinking config. Overrides top-level value. Set to `null` to disable |

#### Precedence

```
CLI flags > per-upstream fields > top-level fields > built-in defaults
```

#### Example: auto-fallback for text-only models

When `deepseek` has `dropImages: true` and the user sends an image, the proxy automatically routes to `kimi`:

```json
{
  "currentUpstream": "deepseek",
  "upstreams": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-...",
      "model": "deepseek-v4-flash",
      "dropImages": true,
      "fallback": "kimi"
    },
    "kimi": {
      "baseUrl": "https://api.kimi.com/coding/v1",
      "apiKey": "sk-kimi-...",
      "model": "kimi-for-coding",
      "headers": { "user-agent": "KimiCLI/1.39.0" }
    }
  }
}
```

## Codex Configuration

Codex `0.128.0+` requires custom providers to speak the Responses API. `@codeproxy/cli` bridges this gap for any Chat Completions or Anthropic Messages upstream.

### Quick setup

1. Start the proxy:

```bash
npx @codeproxy/cli --base-url https://api.deepseek.com/v1 \
  --model deepseek-v4-flash \
  --apikey sk-your-key
```

2. Add a custom provider in `~/.codex/config.toml`:

```toml
[model_providers.deepseek]
name = "DeepSeek"
base_url = "http://127.0.0.1:8787/v1"
wire_api = "responses"

[profiles.deepseek-pro]
model = "deepseek-v4-flash"
model_provider = "deepseek"
```

### With reasoning effort

```toml
[model_providers.deepseek]
name = "DeepSeek"
base_url = "http://127.0.0.1:8787/v1"
wire_api = "responses"

[profiles.deepseek-pro]
model = "deepseek-v4-flash"
model_provider = "deepseek"
model_reasoning_effort = "high"
```

`@codeproxy/cli` automatically maps `reasoning.effort` to the upstream's native format (e.g., `reasoning_effort` for OpenAI Chat, `thinking` blocks for Anthropic).

### Multiple upstreams via config file

```json
{
  "currentUpstream": "deepseek-chat",
  "upstreams": {
    "deepseek-chat": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-...",
      "model": "deepseek-v4-flash",
      "dropImages": true,
      "fallback": "kimi"
    },
    "kimi": {
      "baseUrl": "https://api.kimi.com/coding/v1",
      "apiKey": "sk-kimi-...",
      "model": "kimi-for-coding",
      "headers": { "user-agent": "KimiCLI/1.39.0" }
    },
    "claude": {
      "baseUrl": "https://api.anthropic.com/v1",
      "apiKey": "sk-ant-...",
      "model": "claude-sonnet-4-20250514"
    }
  }
}
```

Switch upstreams by changing `currentUpstream` and restarting the proxy — no Codex config changes needed.

## Install

```bash
npm install -g @codeproxy/cli
```

## CLI Options

| Flag | Default | Description |
|---|---|---|
| `--base-url <url>` | — | Upstream endpoint (required unless `--config`) |
| `--upstream-format <fmt>` | inferred | `anthropic` or `openai-chat` |
| `--config <file>` | — | JSON config file |
| `--host <host>` | `127.0.0.1` | Bind host |
| `-p, --port <port>` | `8787` | Bind port |
| `--api-version <ver>` | `2023-06-01` | Override Anthropic version header |
| `--apikey <key>` | — | Upstream API key |
| `--model <name>` | — | Override model for all requests |
| `--drop-images` | — | Strip images (text-only models) |

## Programmatic usage

```ts
import { createResponsesFetch, startProxy } from '@codeproxy/cli';

const proxy = await startProxy({
  upstreamFormat: 'openai-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  defaultHeaders: { authorization: 'Bearer sk-...' },
});
```

## License

MIT
