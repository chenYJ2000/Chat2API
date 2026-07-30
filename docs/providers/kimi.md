# Kimi

| 项目 | 说明 |
| --- | --- |
| 供应商 ID | kimi |
| 官网 | https://www.kimi.com |
| API Base | https://www.kimi.com |
| 认证 | JWT Token |
| 凭据字段 | `token` |

## 默认模型

| 显示名称 | 实际模型 ID |
| --- | --- |
| Kimi-K3 | k3 |

## 适配状态

已适配：Connect JSON 对话接口、流式对话、非流式对话、多轮会话、账号级批量清理对话记录、联网搜索和 K3 思考强度。

K3 请求使用官网当前的 `SCENARIO_OK_COMPUTER` 场景和 `ok-computer` Agent。OpenAI 兼容参数映射如下：

| `reasoning_effort` | Kimi 思考强度 | 官网枚举 |
| --- | --- | --- |
| `none` / `off` / `minimal` / `low` / `standard` / `false` | 标准 | `REASONING_EFFORT_LOW` |
| `medium` / `high` / `advanced` / `enabled` / `true` | 进阶 | `REASONING_EFFORT_HIGH` |
| `xhigh` / `max` / `extreme` | 极致（会员权限允许时） | `REASONING_EFFORT_MAX` |

未传 `reasoning_effort` 时使用官网默认的“进阶”。也兼容 camelCase 的 `reasoningEffort` 和 `enable_thinking` 布尔开关；无效值返回 HTTP 400。

后续验证：批量删除接口的返回格式、K3 百万 Token 上下文的会员权限行为。

## 教程

1. 登录 `www.kimi.com`。
2. 打开 DevTools -> Application -> Cookies，复制 `kimi-auth` 值，或复制可用 JWT/refresh token。
3. 在供应商管理中添加 Kimi 账号，填入 `token`。
4. 默认模型为 `Kimi-K3`；调用方可通过 `reasoning_effort` 选择“标准”或“进阶”。
