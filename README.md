# @codeproxy/cli

> **中文版** → [README.zh-CN.md](./README.zh-CN.md)

**@codeproxy/cli** is a local proxy server that converts **any** Chat Completions or Anthropic Messages API into the **OpenAI Responses API** format. It lets Codex, Claude Code, or any Responses-API client use models from DeepSeek, GLM, Kimi, and more.

Built on [@codeproxy/core](https://github.com/codeproxy-ai/core).

## Quick Start

```bash
npx @codeproxy/cli --upstream-format openai-chat \
  --base-url https://api.deepseek.com/v1 \
  --apikey sk-your-key
```

Point your Responses-API client at `http://127.0.0.1:8787`:

```bash
curl -N http://127.0.0.1:8787/v1/responses \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $API_KEY" \
  -d '{"model":"deepseek-v4-pro","input":"Hello!","stream":true}'
```

### With config file

```bash
npx @codeproxy/cli --config config.json
```

```json
{
  "version": "1.0",
  "currentUpstream": "deepseek",
  "upstreams": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-...",
      "model": "deepseek-v4-pro"
    }
  }
}
```

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
