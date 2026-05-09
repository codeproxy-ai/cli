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

完整的配置示例见 [config.example.json](./config.example.json)。

#### 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | `string` | 配置格式版本（当前为 `"1.0"`） |
| `currentUpstream` | `string` | 当前使用的上游名称（必须是 `upstreams` 中的某个 key） |
| `headers` | `object` | 应用到**所有**上游的默认请求头（与各上游的 headers 合并，上游级别优先） |
| `reasoningEffort` | `string` | 所有上游的默认推理力度：`"low"`、`"medium"`、`"high"`、`"xhigh"` |
| `thinking` | `object` `|` `null` | 所有上游的默认 thinking 配置。Anthropic 格式：`{"type": "enabled", "budget_tokens": 16384}`。设为 `null` 禁用 |
| `timeoutMs` | `number` | 默认上游请求超时时间（毫秒） |

#### 每个上游的字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `format` | `"anthropic"` `|` `"openai-chat"` | 上游 API 格式。省略时从 `baseUrl` 推断（路径结尾是 `/messages` \u2192 `anthropic`，`/chat/completions` \u2192 `openai-chat`，否则回退到 `openai-chat`）。路径后缀会自动补全 |
| `baseUrl` | `string` | **必需。** 上游端点 URL |
| `apiKey` | `string` | 上游 API 密钥。作为 `Authorization: Bearer <key>` 发送（Anthropic 会转为 `x-api-key`） |
| `model` | `string` | 覆盖所有传入请求中的 `model` 字段 |
| `apiVersion` | `string` | 覆盖 `anthropic-version` 请求头（仅 Anthropic） |
| `headers` | `object` | 该上游的额外 HTTP 请求头。合并到顶层 `headers` 之上，上游级别优先 |
| `timeoutMs` | `number` | 该上游的请求超时（覆盖顶层 `timeoutMs`） |
| `dropImages` | `boolean` | 设为 `true` 时，从用户消息中移除图片/文件部分（用于纯文本模型）。配合 `fallback` 使用，含图片的请求会自动路由到支持视觉的上游 |
| `fallback` | `string` | 另一个上游的名称。当当前上游设了 `dropImages: true` 且请求包含图片时，自动切换到该上游 |
| `reasoningEffort` | `string` | 该上游的推理力度覆盖（`"low"`、`"medium"`、`"high"`、`"xhigh"`）。覆盖顶层值 |
| `thinking` | `object` `|` `null` | 该上游的 thinking 配置。覆盖顶层值。设为 `null` 禁用 |

#### 优先级

```
CLI 标志 > 每个上游的字段 > 顶层字段 > 内置默认值
```

#### 示例：纯文本模型的自动回退

当 `deepseek` 设了 `dropImages: true` 且用户发送图片时，代理自动路由到 `deepseek-vision`（支持视觉）：

```json
{
  "currentUpstream": "deepseek",
  "upstreams": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "model": "deepseek-v4-pro",
      "dropImages": true,
      "fallback": "deepseek-vision"
    },
    "deepseek-vision": {
      "baseUrl": "https://api.deepseek.com/v1",
      "model": "deepseek-v4-vision"
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
