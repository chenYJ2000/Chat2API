# Qwen AI

| 项目 | 说明 |
| --- | --- |
| 供应商 ID | qwen-ai |
| 官网 | https://chat.qwen.ai |
| API Base | https://chat.qwen.ai |
| 认证 | JWT Token |
| 凭据字段 | `token`, `cookies` |

## 默认模型

内置默认模型只保留当前筛选后的稳定清单：排除 Qwen3.5 和更低版本，排除普通 Qwen3，保留 Qwen3-Coder，排除 Preview 版本。

| 显示名称 | 实际模型 ID |
| --- | --- |
| Qwen3.7-Max | qwen3.7-max |
| Qwen3.6-Plus | qwen3.6-plus |
| Qwen3.6-35B-A3B | qwen3.6-35b-a3b |
| Qwen3.6-27B | qwen3.6-27b |
| Qwen3-Coder | qwen3-coder-plus |

## 其他官网模型

以下模型来自 `backup/har/chat.qwen.ai2.har` 中实际调用对话的官网模型。它们不作为内置默认模型，用户可在供应商管理 -> 模型管理中自行添加：显示名称填左列，实际模型 ID 填右列。

| 显示名称 | 实际模型 ID | 备注 |
| --- | --- | --- |
| Qwen3.7-Max-Preview | qwen-latest-series-invite-beta-v24 | Preview |
| Qwen3.7-Plus-Preview | qwen-latest-series-invite-beta-v16 | Preview |
| Qwen3.6-Max-Preview | qwen3.6-max-preview | Preview |
| Qwen3.6-Plus-Preview | qwen3.6-plus-preview | Preview |
| Qwen3.5-Plus | qwen3.5-plus | 低版本 |
| Qwen3.5-Omni-Plus | qwen3.5-omni-plus | 低版本 |
| Qwen3.5-Flash | qwen3.5-flash | 低版本 |
| Qwen3.5-Max-Preview | qwen3.5-max-2026-03-08 | 低版本 Preview |
| Qwen3.5-397B-A17B | qwen3.5-397b-a17b | 低版本 |
| Qwen3.5-122B-A10B | qwen3.5-122b-a10b | 低版本 |
| Qwen3.5-Omni-Flash | qwen3.5-omni-flash | 低版本 |
| Qwen3.5-27B | qwen3.5-27b | 低版本 |
| Qwen3.5-35B-A3B | qwen3.5-35b-a3b | 低版本 |
| Qwen3-Max | qwen3-max-2026-01-23 | 普通 Qwen3 |
| Qwen3-235B-A22B-2507 / Qwen2.5-Plus | qwen-plus-2025-07-28 | HAR 页面标签存在歧义 |
| Qwen3-VL-235B-A22B | qwen3-vl-plus | 多模态 |
| Qwen3-Omni-Flash | qwen3-omni-flash-2025-12-01 | Omni |
| Qwen2.5-Max | qwen-max-latest | 低版本 |

## 适配状态

已适配：国际版网页对话、流式对话、非流式对话、多轮会话、账号级清理对话记录、思考模式后缀、模型别名。

## 生成参数

- 默认使用快速模式。模型名加 `-thinking` 强制开启思考，加 `-fast` 强制关闭思考；模型名后缀优先级最高。
- `enable_thinking` 可显式开关思考，`thinking_budget` 用正整数限制思考 token。
- `reasoning_effort` 兼容 `minimal`、`low`、`medium`、`high`、`xhigh`、`max` 和 `enabled`，会映射为有限的思考预算；`none`、`off`、`disabled` 会关闭思考。
- `max_tokens` 与 `max_completion_tokens` 会继续传给 Qwen 上游。由于 Qwen 网页接口没有公开 OpenAI 式总量开关，FluxMeld 还会监控上游累计 usage，在达到回答/总量边界时终止流并返回 `finish_reason: "length"`；思考预算也会自动给最终回答预留空间。
- 以上 token 参数必须是正整数；无效值会返回 HTTP 400，不会先创建无用的官网会话。
- 托管工具调用会按请求中的完整 JSON Schema 校验参数，且不会做类型强转或删除额外字段。缺少必填字段、类型/枚举/范围不符、非法 JSON 或内部协议标记污染都会返回 HTTP 502，不会作为成功工具调用下发。

后续验证：官网反爬请求头、模型接口版本、Preview 邀请模型是否仍可用、图片/多模态模型字段。

## 教程

1. 登录 `chat.qwen.ai`。
2. 打开 DevTools -> Application -> Local Storage，复制 `token`；如请求需要 Cookie，同时复制完整 Cookie 字符串。
3. 在供应商管理中添加 Qwen AI 账号，填入 `token`，可选填 `cookies`。
4. 在模型管理中使用默认模型；如需上表其他模型，手动添加显示名称和实际模型 ID。
