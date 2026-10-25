# Cursor provider：创造模式交接

记录日期：2026-10-26。本文是研究交接，不是已完成的设计或实现。用户要求以后在创造模式中开发；本轮只整理资料，不安装依赖、不修改 DSH、不调用密钥。

## 目标与仓库

让用户在 DSH 中选择 Cursor 账号可用的模型，使用 Cursor 用户 API Key，继续由 **DSH 执行工具、审批、管理技能和会话**。不要退化成“把任务交给 Cursor 自己执行，再返回最终文本”。用户报告已在 Hermes 使用下列参考插件成功接入，本会话没有实测。

- 插件目录：`C:/Users/Kaczev/Documents/GitHub/dsh-cursor-provider`。检查时只有 `.gitattributes`，没有实现、构建配置或测试命令。
- 参考目录：`C:/Users/Kaczev/Documents/GitHub/hermes-cursor-provider`。HEAD 为 `bf7d61fb1e37fa78ec58de7683ec436dff5b71bf`，工作树干净。
- DSH 源码：`C:/Users/Kaczev/Documents/GitHub/deepseek-harness`。HEAD 为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，工作树干净。
- 不要编辑运行时提示中的 `resources/app.asar/dsh`；这是打包归档内部路径，普通文件工具之前无法直接读取。上面的 Git checkout 已核实可读。

用户此前暂停实施，本轮仅要求交接。旧自动开发目标仍暂停，不应因读到本文就自动恢复；后续实施以创造模式会话的用户授权为准。

## Cursor 跟普通模型 API 哪里不同

用户 Key 来自 `https://cursor.com/dashboard/api`，不是 xAI Key。不能把它放进普通 OpenAI provider，再填 `https://api.cursor.com/v1` 就期待聊天/模型列表正常工作。此前“Cursor Key 不能接入 DSH”的判断过于绝对：没有确认可直接使用的公开 OpenAI 聊天端点，但可以通过官方 SDK 适配。

常规模型接口通常由宿主发送完整 messages/tools，服务器返回文本或 function call。Cursor SDK 暴露 **Agent → Run**：本机 SDK bridge 启动/连接 agent，发送消息、消费流、等待终态。SDK 有自己的历史、工具环境、进程和清理需求；一次 run 可能包含多个模型 turn，不能照搬普通单次聊天的上下文统计。

参考 README 声明 SDK 用户 Key 的调用计入同一 Cursor plan/request pool。它不等于无限免费，不保证所有模型都在套餐内，也不保证没有超额费用；真实调用前核对当前套餐与 SDK 账单规则。不要把 xAI 直连 API 的价格当成 Cursor 价格。参考插件支持用户/服务账号 Key，不把 Team Admin Key 当推理凭据。

参考依赖为 Python `cursor-sdk>=1.0.32,<2`。官方还有 TypeScript `@cursor/sdk`；DSH 是 Node/TypeScript 插件体系，但**尚未决定使用 TS SDK 还是隔离 Python transport，也未核实两者能力一致**。先核对选定版本的实际 API。不能把 Python 方法机械改名成 TS，也不能直接安装 Hermes 插件当 DSH 插件。

## 参考源码导航

以下路径均相对参考仓库。大文件只局部核读并按函数定位，尚未逐行安全审计；迁移受影响部分之前必须读实际源码与测试。

- `README.md:5-16,26,43-60,76-100`：接入范围、模型变体、隔离与限制。
- `provider/plugin.yaml:1-8`：版本 0.4.1，要求 Hermes >=0.22.0，SDK 版本范围。
- `provider/__init__.py`：Hermes 注册入口，不能直接复用为 DSH 注册。
- `provider/hermes_cursor_provider/client.py:404-634`：工具定义、提示词、图片和工具块解析。
- `provider/hermes_cursor_provider/client.py:635-724`：计费用量与上下文 anchor。
- `provider/hermes_cursor_provider/client.py:775-946`：跨 chunk 工具块解析、原生通道拦截、纠正提示。
- `provider/hermes_cursor_provider/client.py:947-1072`：模型参数解析、归一化与 catalog 校验。
- `provider/hermes_cursor_provider/client.py:1109-1241`：bridge/session 生命周期与租借。
- `provider/hermes_cursor_provider/client.py:1379-1412`：创建 agent 的实际参数。
- `provider/hermes_cursor_provider/client.py:1414-2048`：流、超时、恢复、会话执行与输出包装。
- `provider/hermes_cursor_provider/client.py:2049-2108`：动态模型目录和配置变体。
- `tests/test_client.py`、`tests/test_native_tools.py`、`tests/test_recovery.py`、`tests/test_run_deadline.py`：离线测试入口，尚未运行。
- `SECURITY.md`、`docs/recovery-tdd.md`、`LICENSE`、`NOTICE`：安全限制、恢复规则与许可。

### 工具仍由 DSH 执行

参考 `_create_agent()` 实际传入 `api_key`、私有 `local.cwd`、`mcp_servers: {}`、`tools: []`。README 说明 Cursor 内建工具/MCP 被关闭；不用 SDK custom-tool callback 直接执行宿主工具，因为 callback 位于 SDK run 内，会绕过宿主审批。私有临时目录本身不等于安全沙箱。

参考插件把宿主工具 schema 写进 SDK 请求，解析显式 `<tool_call>` 块并返回宿主工具调用，也拦截原生通道上发出的宿主工具意图。**这是提示词级工具协议，不是已验证的端到端原生 function calling。**要验证禁用 Cursor 本机执行、校验允许名称和参数、处理未知调用；不能根据“我要读文件”之类文本猜测并执行工具。

参考版本对某些“宣布行动却无工具调用”及未满足 required/named tool choice 的情况最多纠正两次，普通问题、条件性提议不应误重试。DSH 当前 GenerateOptions 没有 tool_choice，不必照搬无消费者的能力。内部纠正会增加计费，还可能违反 DSH 模型输入可从日志重建的要求；是否第一版支持、如何记录，必须先解决，不能偷偷注入未记录的输入。

### 会话、压缩、并发

参考插件按 profile、会话、账号 Key 摘要和完整模型变体隔离 agent，复用时只发送新增历史。历史重写/压缩后新建 agent；同会话并发无法独占时使用隔离 one-shot。默认最多保留 16 个空闲 agent，活跃 agent 可暂时超出。进程重启不做跨进程 resume。这些数字是参考行为，不是已决定的 DSH 默认值。

DSH 主会话、压缩总结、标题生成都可能调用 LLM，不能因辅助调用没有普通 sessionId 就混用一个有历史的 agent。完整历史前缀、system/tools 更新、失败后状态、模型/Key 切换都需明确失效规则；无法确认一致性时不能继续复用。

### 计费与上下文不能用同一个总数

SDK `result.usage` 可能累计 run 内多个 turn。参考插件把 `input_tokens`、`output_tokens`、`cache_read_tokens`、`cache_write_tokens` 作为计费用量，并累计被丢弃的纠正尝试；上下文 anchor 则取相关尝试中最大的单 turn 输入，不累加。

不能把 240k+241k+242k 的计费输入 723k 当成一次上下文；参考 README 记录过这种误报使仍能放进 500k 窗口的会话无法继续压缩。最后一条 usage 也不一定是峰值。没有单 turn usage 时不要编造精确 anchor。`initial_prompt_tokens` / `initial_cached_tokens` 是 Hermes 约定，DSH 对应字段、token-meter 接入尚待核实，不能照搬字段名。

### 模型与参数

以用户账号 SDK `list_models()` 为准。参考插件支持 `grok-4.7@fast=true,reasoning_effort=xhigh` 等后缀，校验 parameter id/value、归一化顺序，每种参数组合独立 agent；`context=` 也影响宿主压缩预算。示例不证明用户账号拥有相同模型/变体。旧 CLI 的 `grok-4.7-high-fast` 不应被直接当成 SDK ID。

尚未获取用户 catalog；Cursor 下的最大输出、真实价格、具体参数范围均未确认。未知能力保持未知，不用其他平台数据补齐。SDK 无法表达的 temperature/maxTokens/stop 等控制不能静默忽略或假装已生效。

### 流、超时与取消

跨 chunk 解析工具块，避免将半截工具 JSON 显示成普通回答；取得 run 最终状态，区分启动失败、执行失败、取消。资源必须在取消、卸载和退出时清理。

参考超时默认 1800 秒，范围 0.05–86400 秒，覆盖 send 的 priming read、每次惰性 stream pull 和 wait，不仅是 `run.wait()`。晚到的 send/run 仍需唯一清理责任者。参考 Python 方案不能瞬间中断所有阻塞底层读，清理可能只是有限等待；迁移后不要承诺取消立即停止所有工作。

## DSH 接入位置：已确认与待确认

本轮读取根 `AGENTS.md`、LLM README 和局部源码。实施前重新遵循仓库指令，按需读 `docs/architecture.md`、`docs/defensive-patterns/README.md`；若修改 DSH packages，读相应目录指令。优先在独立插件仓库实现，不预设需要改 DSH 核心。

- `packages/llm/llm/src/index.ts:208`：`export abstract class LlmAdapter`，通过 `ctx.llm.registerAdapter(providers, adapter)` 注册 route。还需读完整接口和现有 adapter。
- `listModels(_provider: string): Promise<readonly LlmModelInfo[]>` 默认空列表；GUI 选模与提交要求 catalog 成员，只实现 stream 不够。
- `resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>` 解析精确模型元数据。关注 `prepareCall()` 捕获同一 adapter generation，避免热更新后元数据与 dispatch 混用。
- `packages/llm/llm/src/types.ts:529-571`：GenerateOptions 含 provider/model/messages/system/tools/toolHistory、reasoningEffort、temperature/maxTokens/stop、signal/sessionId、`purpose?: 'compaction' | 'session-title'`。
- `packages/llm/llm/README.md`：loop 请求深冻结，不能重写；模型可见输入必须可从 session 日志重建；stream 恰有一个终端 finish，usage 在 finish 前、finish 后无内容，工具参数保持 raw JSON string；错误/取消使用结构化 failure。
- 基础 LLM 服务不执行 retry，`llm-retry` 承担外层重试。adapter 内部纠正/重试如何避免重复计费和历史错乱需要确定。
- LlmAdapter 文档要求 provider HTTP 请求带 `attributionHeaders()`；若 SDK 无上游 header 注入能力，应记录具体冲突并确认接法，不能声称已满足。
- credentials/settings/provider directory、完整模型元数据和 usage 类型、token-meter 接入、插件 bundle/安装规范、发布版兼容范围尚未核实。

DSH checkout 根指令要求 Node >=24.9、pnpm；不代表插件已经选定最低运行版本。源码与用户已安装 DSH 可能不是同一版本，开发前确定 peer dependency 范围。

## 为什么不直接采用其他现成方案

- `https://github.com/qyjqio/dsh-cursor-toolkit`：已读版本走 CLI，不是这里需要的 SDK provider。bridge 每轮启动 CLI、提示词模拟工具，写死模型目录、丢弃图片、schema 超 4000 字符会截断，本地 HTTP 不检查认证；CLI tool 则外包整个 Cursor agent。不是全面审计结论，但足以不直接作为日常主力安装。
- `https://github.com/yhlooo/dsh-bridges`：README 表明迁移规则、技能、hooks、MCP 配置，不接 Cursor 模型/订阅。
- `https://github.com/AureliusIvan/cursor-sdk-for-hermes`：README 说明 Cursor 自己执行工具，宿主工具循环不参与，且锁定旧 SDK 0.1.5；不符合保留 DSH 工具执行权的目标。
- 用户确认使用 `https://github.com/anpicasso/hermes-cursor-provider`。进入 Hermes 社区目录并固定 reviewed commit 是来源线索，不证明天然兼容 DSH 或绝对安全。

## 后续验收与授权

先用无 Key 的 mock transport 覆盖：模型目录/参数错误、文本流、跨 chunk 工具块、非法调用、图片、历史增量/重写/压缩、system/tools 变化、辅助调用隔离、并发、Key/模型切换、失败、send/pull/wait 超时、取消后晚到结果清理、累计计费与单 turn 上下文分离、插件卸载清理。

用户同意真实调用并在本地配置密钥后，再做低费用 smoke：真实目录、文本、一个由 DSH 执行的安全工具调用、多轮、取消；记录费用与未验证能力。不要读取 Hermes 保存的 Key，不让用户贴 Key，不写入仓库或日志。若自建 HTTP transport，需认证/请求限制且只监听 loopback；不要把自建代理和 SDK 自有 bridge 混为一谈。

参考项目 MIT，移植代码按 LICENSE 保留版权许可。SDK 和 bundled bridge 是独立专有依赖，不作为 MIT 源码复制进仓库。

### 命令与验证状态

本轮实际仅执行两仓库的 `git rev-parse HEAD`、`git status --short`，均 exit 0。未安装、未运行测试/build、未调用真实 API。

参考 CI 声明安装 `cursor-sdk>=1.0.32,<2`、pytest 后运行 `pytest -q`；还克隆 Hermes 并运行 `scripts/current_main_probe.py`。这些是参考项目命令，本轮未运行，不是 DSH 插件验收命令。真实 Key probe 不应意外执行。

DSH 根文档列出 `pnpm run test`、`pnpm run typecheck`、`pnpm run build:artifacts`、`pnpm run build:check`，按改动范围选用；若改 DSH 核心，最终 build:check 应在最新 build:artifacts 后。新插件没有 manifest，因此其安装、测试、打包、DSH smoke 命令均未确认；创造模式应建立并运行，不能把本文当作通过记录。

官方入口：`https://cursor.com/docs/sdk/python`、`https://cursor.com/docs/sdk/typescript`、`https://cursor.com/terms-of-service`。SDK 版本冲突以选定版本的实际 API 与契约测试核实。
