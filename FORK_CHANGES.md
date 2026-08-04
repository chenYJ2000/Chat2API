# Upstream-derived change history / 上游衍生变更记录

This historical document records the changes maintained by this project relative to
[`xiaoY233/Chat2API`](https://github.com/xiaoY233/Chat2API) `main` at commit
`59f03ab` (2026-05-28). The original Git history, copyright notice, and
GPL-3.0 license are retained.

本文记录本项目相对于原项目
[`xiaoY233/Chat2API`](https://github.com/xiaoY233/Chat2API) `main` 分支提交
`59f03ab`（2026-05-28）的全部主要改动。仓库保留原始 Git 历史、版权声明与
GPL-3.0 许可证。

衷心感谢原作者 [xiaoY233](https://github.com/xiaoY233) 和 Chat2API 的所有原项目贡献者。
本版本是在他们开源成果的基础上继续改进。

## 中文完整变更说明

### 1. Qwen AI 国际版适配稳定性

- 更新 Qwen Web 请求版本并动态生成时区请求头，避免固定时间字段过期。
- 调试日志不再打印 `Authorization`、Cookie、`bx-ua`、`bx-umidtoken` 的真实值。
- 保留完整 OpenAI 对话上下文：system、user、assistant、assistant tool calls、tool result 都会进入 Qwen 请求，工具校验失败后的纠正轮次不再丢失上下文。
- 同时兼容 Qwen phase 响应与无 `phase` 的 OpenAI 风格 delta。
- 流式和非流式响应都会识别 HTTP 200 SSE 内嵌错误，不再把上游错误误报为成功。
- 上游结束时若没有任何 assistant 正文，会返回失败，不再产生空白“成功”响应。
- 使用上游真实 usage，保留真实 `finish_reason`，并区分 reasoning 与最终回答内容。
- 流式响应先等待有效数据或明确错误，再向调用方返回；快速结束、`[DONE]`、transport end/close、异常和客户端中断都只结算一次。
- 会话清理回调在流开始前安装并保证最多执行一次，避免极短响应留下远端会话。
- 托管工具调用的流式响应先完整缓冲、校验并转换为 OpenAI tool-call delta，避免内部 XML/标记泄漏到普通正文。

### 2. 快速模式、思考模式与生成参数

- Qwen AI 默认快速模式；模型名 `-thinking` 后缀强制思考，`-fast` 后缀强制快速，后缀优先级最高。
- 负载均衡和模型映射会先识别基础模型，再把模式后缀带到实际模型 ID，后缀模型不再被误判为“不支持”。
- 支持 `enable_thinking`、`thinking_budget`、`reasoning_effort`、`max_tokens`、`max_completion_tokens`。
- `reasoning_effort` 支持 `minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`enabled`；`none`、`off`、`disabled`、`false` 会明确关闭思考。
- 思考强度映射为有界预算；存在总 completion 上限时，会给最终回答保留 token 空间。
- token 上限必须是正整数。无效参数会在创建 Qwen 远端会话之前返回 HTTP 400。
- Qwen Web 没有完全等价的 OpenAI token 控件，因此除了向上游透传参数，还会在 usage 检查点执行回答/总量限制，并以 `finish_reason: "length"` 结束。
- GLM、Kimi、DeepSeek 等共用明确的 reasoning 开关语义，字符串 `none` 不会再因为“非空字符串”为真而误开深度思考。

### 3. 工具调用安全校验

- 新增 AJV 与 `ajv-formats`，对客户端声明的完整 JSON Schema 和模型返回参数做校验。
- 客户端 schema 在请求上游之前编译；非法 schema 返回 HTTP 400。
- 每个模型 tool call 都会验证：工具名在允许清单、arguments 是 JSON 字符串、可解析为普通对象、符合完整 schema、且不含上游遗留协议标记。
- 不做类型强转、不自动填默认值、不删除额外字段；`required`、类型、枚举、范围、格式、`additionalProperties` 等规则按 schema 执行。
- 模型缺少必填工具、返回非法工具名或非法参数时返回 HTTP 502，不再把错误参数作为成功调用交给业务系统。
- `tool_choice: required` 和强制指定函数都会严格执行；原生 tool calls 与提示词解析得到的 tool calls 使用同一套校验。
- 公共响应会移除内部 `rawText` 元数据，防止协议实现细节泄漏。
- schema 编译缓存限制为 256 项，单个 schema 最多 100,000 字符，避免无界缓存和异常大输入。
- AJV 依赖被显式打入 Electron main bundle，并有打包回归测试，避免安装包启动后缺模块。

### 4. 请求重试、账号故障转移与状态码

- Provider 转发从连续条件分支改为静态注册表，降低新增/维护适配器时的分发风险。
- 保留最终 HTTP 状态码；参数错误与模型语义错误不再被统一覆盖成普通 500。
- 仅对可恢复错误重试：认证、限流、超时、部分冲突状态和 5xx；明确的 4xx 参数错误会立即返回。
- 重试会优先切换到同模型的其他可用账号，并排除本次请求已尝试账号；所有负载策略都会排除处于隔离期的失败账号。
- 有其他账号时立即故障转移；没有其他账号时才按配置等待后重试。
- 只有认证、限流、网络/服务端错误会惩罚账号；工具 schema/模型参数等语义失败不会错误隔离健康账号。
- 最终实际使用的 provider、account、actual model 会回传到路由层，日志、统计和账号计数不再错误记到第一次尝试的账号。
- 移除负载均衡日志中的 token 前缀输出。

### 5. 流式生命周期与并发隔离

- SSE parser 改为每个请求独立实例，避免并发流共享 partial-line buffer 后串流或拼接错位。
- 流式请求只有在正常结束后才计为成功，latency 使用真实结束时间。
- 上游流错误、转换流错误和客户端提前断开都会记录为失败；客户端断开时主动销毁上游流。
- 成功/失败结算加一次性保护，避免 end、close、error 多事件造成重复统计或重复账号计数。
- `/v1/chat/completions` 和旧 completions 路由都使用故障转移后的真实账号信息。

### 6. 请求与响应日志

- 修复流结束时的 partial update 把原始 `userInput` 等未提供字段覆盖为 `undefined` 的问题。
- `userInput` 与请求/响应正文使用同一敏感信息脱敏策略，并分别执行长度限制。
- 正文持久化默认关闭；开启时默认最多保存 8,000 字符且默认脱敏。该设置只影响新请求。
- 流式日志会记录最终状态、真实延迟和实际 SSE 响应；错误会写入最终状态与错误信息。
- 日志详情页在正文为空时明确提示如何开启“保存请求体与响应体”，并补齐中英文文案。
- reasoning 字段类型扩展为 string/boolean，UI 可正确显示 `false`、`none` 等显式值。

### 7. 依赖、测试与持续集成

- 添加 AJV、`ajv-formats` 与跨平台 TypeScript 测试运行器 `tsx`。
- 锁文件更新到已修复版本的 Axios、Koa、electron-updater 等依赖；高危/严重级别的 production dependency audit 为 0。
- 新增跨平台 `npm test` 命令，递归发现 `.test.js`、`.test.mjs`、`.test.ts`。
- 新增 GitHub Actions CI：Node.js 22 下执行 `npm ci`、180 项测试和 production build。
- 新增/扩展测试覆盖 Qwen SSE、usage、空响应、内嵌错误、快速/思考模式、token 限制、工具上下文、账号故障转移、隔离账号、并发 SSE、日志 patch、schema 校验与 Electron 打包。

### 8. 已知限制与推荐用法

- FluxMeld 驱动的是供应商 Web 接口，不是供应商承诺稳定的官方 OpenAI API；网页协议、反爬字段和可用模型可能随时变化。
- Qwen3.7-Max 快速模式的模型输出本身仍可能漏工具或生成错误参数。网关现在会安全返回 502，而不是放行危险调用，但无法让模型本身变得确定。
- 本地抽样中 Qwen3.6-Plus 快速模式的工具调用稳定性高于 Qwen3.7-Max 快速模式；复杂复核任务建议使用 Max thinking，直接执行工具优先使用 Qwen3.6-Plus fast。
- Qwen token 限制依赖上游 usage 检查点，因此不是逐 token 的硬截断。
- 请求/响应正文日志默认关闭；开启前已经产生的旧日志无法补录正文。
- 为避免未经验证的大版本迁移，本 fork 暂时保留上游 Electron 33/build toolchain。production dependency audit 没有 high/critical，开发/打包工具链仍有需要未来通过 Electron 与 electron-builder 大版本升级解决的 advisory。

### 9. 文件对应关系

| 范围 | 主要文件 |
| --- | --- |
| Qwen 请求、模式、SSE、usage、会话清理 | `src/main/proxy/adapters/qwen-ai.ts` |
| reasoning 语义 | `src/main/proxy/utils/reasoning.ts`, `adapters/glm.ts`, `adapters/providerModelOptions.ts` |
| 转发、重试、故障转移 | `src/main/proxy/forwarder.ts`, `src/main/proxy/loadbalancer.ts` |
| 流式路由、统计与日志 | `src/main/proxy/routes/chat.ts`, `routes/completions.ts`, `src/main/proxy/stream.ts` |
| 工具 schema 安全校验 | `src/main/proxy/toolCalling/ToolCallingEngine.ts`, `electron.vite.config.ts` |
| 请求日志与 UI | `src/main/requestLogs/sanitizer.ts`, `src/main/store/types.ts`, `RequestLogDetail.tsx`, i18n 文件 |
| OpenAI 兼容类型 | `src/main/proxy/types.ts`, `src/renderer/src/types/electron.d.ts` |
| 测试与 CI | `tests/`, `scripts/run-tests.mjs`, `.github/workflows/ci.yml` |
| Qwen 使用说明 | `docs/providers/qwen-ai.md` |

## Complete English summary

- Hardened Qwen AI streaming and non-streaming parsing: embedded-error detection,
  empty-response rejection, real usage and finish reasons, phase-less delta support,
  single-shot cleanup, output-limit checkpoints, and independent stream lifecycle state.
- Preserved the complete OpenAI conversation, including assistant tool calls and tool
  results, when serializing requests to the Qwen Web endpoint.
- Added explicit fast/thinking suffix routing and validated reasoning/token controls;
  explicit disabled values no longer accidentally enable reasoning on other providers.
- Added strict AJV validation for client tool schemas and model-generated arguments.
  Bad client schemas return 400; missing or invalid model tool calls return 502 and are
  never emitted as successful business actions.
- Buffered managed Qwen tool streams before conversion so internal protocol text cannot
  leak into public OpenAI responses.
- Added account-aware retry/failover, quarantine enforcement, terminal status
  preservation, and accurate accounting for the account that served the final attempt.
- Isolated SSE parser state per request and made stream success/failure accounting occur
  exactly once at the real end of the response.
- Fixed partial request-log updates, added input/body redaction and truncation, preserved
  request and response bodies when explicitly enabled, and clarified the UI empty state.
- Updated safe compatible dependency locks, added a portable `npm test` command and CI,
  and verified all 180 tests.

See [NOTICE](NOTICE) for upstream attribution and [LICENSE](LICENSE) for GPL-3.0 terms.
