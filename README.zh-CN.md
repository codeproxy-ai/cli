# @codeproxy/cli

> **English** → [README.md](./README.md)

**@codeproxy/cli** 是一个本地代理服务器，将**任何** Chat Completions 或 Anthropic Messages API **转换为 OpenAI Responses API 格式**。让 Codex、Claude Code 等 Responses-API 客户端能使用 DeepSeek、GLM、Kimi 等任意模型。

基于 [@codeproxy/core](https://github.com/codeproxy-ai/core) 构建。

## 快速开始

```bash
npx @codeproxy/cli --upstream-format openai-chat \
  --base-url https://api.deepseek.com/v1 \
  --apikey sk-your-key
```

将你的 Responses-API 客户端指向 `http://127.0.0.1:8787`：

```bash
curl -N http://127.0.0.1:8787/v1/responses \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $API_KEY" \
  -d '{"model":"deepseek-v4-pro","input":"Hello!","stream":true}'
```

### 使用配置文件

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

## 安装

```bash
npm install -g @codeproxy/cli
```

## CLI 选项

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--base-url <url>` | — | 上游端点（除非使用 `--config`，否则必需） |
| `--upstream-format <fmt>` | 自动推断 | `anthropic` 或 `openai-chat` |
| `--config <file>` | — | JSON 配置文件 |
| `--host <host>` | `127.0.0.1` | 绑定地址 |
| `-p, --port <port>` | `8787` | 绑定端口 |
| `--api-version <ver>` | `2023-06-01` | 覆盖 Anthropic 版本头 |
| `--apikey <key>` | — | 上游 API 密钥 |
| `--model <name>` | — | 为所有请求覆盖模型 |
| `--drop-images` | — | 移除图片部分（纯文本模型） |

## 编程使用

```ts
import { createResponsesFetch, startProxy } from '@codeproxy/cli';

const proxy = await startProxy({
  upstreamFormat: 'openai-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  defaultHeaders: { authorization: 'Bearer sk-...' },
});
```

## 协议

MIT
