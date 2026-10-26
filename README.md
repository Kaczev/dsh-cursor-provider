# Cursor SDK 供应商

这个独立 Cordis bundle 注册 `cursor` 模型供应商，使用官方 `@cursor/sdk` 1.0.40。DSH 接收工具调用并负责执行和审批；插件不会在 SDK callback 中运行宿主工具。

在 DSH 插件管理器中安装 npm 包 `dsh-cursor-provider`，然后打开「插件 → Cursor → 详情」填写 Cursor API 密钥。需要 Node.js 24.9 或更新版本，以及兼容 `@deepseek-ai/dsh-llm` 0.2.1-rc.3 的 DSH 环境。

用户已确认图片发送成功。模型行的文字、图片输入类型均可手动勾选，至少保留一种；不勾图片时由 DSH 投影为文字占位。新增模型默认文字，旧模型未声明输入类型时保留原有图片传递行为，首次修改勾选后保存显式声明。

账号目录按凭据摘要在内存缓存 5 分钟，最多 8 个账号；切换模型复用缓存，点击「获取可用模型」强制刷新，换 Key 不共用目录。首次获取、缓存过期仍需联网，因此不承诺所有切换即时完成。

## 接入与边界

Cursor 继续注册为模型供应商，保留宿主默认排序。配置入口为「插件 → Cursor → 详情」中的官方 `plugins.bundle.config` 插槽；界面使用 DSH 主题变量。密钥通过官方 `credentials.set` 写入，输入框不会回填已保存值。模型行支持 ID、显示名称和可展开的上下文预算；也可获取账号目录，在搜索弹窗勾选后添加。保存空列表会隐藏所有模型，旧字符串 ID 列表仍兼容。上下文留空时沿用提供商配置，否则保持未知；填写值仅用于 DSH 预算，不会扩大 Cursor 模型容量。SDK 未提供最大输出 token 控制，因此该项显示为不可编辑。图片通过 SDK 附件发送；SDK 目录没有逐模型视觉能力字段，插件不声称所有模型均支持识图。实际会话模型仍在输入栏选择。不支持自定义 API 地址，不修改官方模型页或冒用内置配置命名空间。

保存凭据与保存配置是两个独立操作，并非跨服务事务；若配置保存失败，已成功写入的凭据不会自动回滚。可保留密钥栏为空后重试配置保存。

Cursor SDK 1.0.40 没有已确认的公开上游标头注入入口。本插件未发送 DSH attribution headers；用户已同意继续开发这一兼容例外，但这不代表 DSH 官方认证。实现只调用 SDK 公开导出，不替换全局 fetch，也不使用私有 transport。

每次请求新建隔离 agent 并发送完整历史。SDK 的 cwd 和公开 JSONL store 位于本次调用的临时目录；环境设置导入、内建工具及 MCP 均关闭。结束时释放 agent 并移除临时目录。临时目录不是操作系统安全沙箱。

工具协议使用显式 `<tool_call>` 块，参数通过 JSON Schema 校验后才返回 DSH。它不是端到端原生 function calling。遇到 SDK 原生工具通道时，请求会失败；插件不根据普通文字猜测工具意图，也不内部重试或纠正模型回答。

插件接受文本和图片。图片由 DSH 附件服务校验读取，以 SDK `SDKUserMessage.images` 的 base64、MIME 和尺寸字段发送，不交给 Cursor 读取本地路径。完整历史中的用户图片和工具返回图片按出现顺序编号，JSON 中保留所属消息及位置；已 offload 的图片保持文字占位，不会重新上传。单次请求内重复附件只读取一次，但保留每次出现的位置。SDK 只提供本次 send 的图片数组，因此历史图片的消息归属依靠显式编号协议表达；尚未做真实多图识别验收。

无法表达的 temperature、maxTokens、stop 等控制会在推理前明确拒绝。模型目录和参数来自账号 SDK catalog；未知的视觉能力、价格和上下文不会用其他平台数据补齐。会话池模块已有离线测试，但当前 transport 不使用历史复用，因此输入用量可能较高。

## 本机检查

环境为 Node 24.19.0、npm 11.17.0。2026-10-27 实际执行：

```sh
npm test
npm run build
```

最新检查为 52 项测试通过，并校验复制 6 个 JavaScript 模块。断言覆盖目录缓存、过期、显式刷新、凭据隔离、文字与图片元数据、旧模型配置保存，以及推理参数别名。插件归并 `parameters` 与 `variants[].params`，识别 `reasoning_effort`、`effort`、`reasoning`，发送时保留上游参数名；已用真实账号目录离线回放五个模型。图片测试覆盖用户与工具消息、重复图片、多轮位置编号、offload、读取失败、取消及 transport 透传；自动测试使用 mock，不读取既有密钥。

```sh
npm run pack:check
```

打包内容包含 Host、Client、图片模块、locale、图标、bundle patch 和视觉参考；不包含研究目录、测试或密钥。参考 Hermes 仓库的 `pytest -q` 不是本插件测试命令。

`npm audit --omit=dev` 报告宿主 peer `@deepseek-ai/dsh-llm` 依赖的 zod 存在高危公告 GHSA-mrhx-c7xc-m3w5。本仓库没有强制覆盖宿主依赖，也没有运行 `audit fix --force`。这项依赖风险仍需宿主版本解决。

## 尚需验收

用户已确认真实图片发送和推理等级修复生效。多图、工具返回图片及模型不支持视觉时的上游行为仍需验收。发布包改用公开包名 `dsh-cursor-provider`；原先通过 `@local/dsh-cursor-provider` 链接安装的用户需通过插件管理器迁移，发布操作不会自动改写本地 profile。

HTML 参考保存在 [design/cursor-provider.html](design/cursor-provider.html)，不连接后端，也不接收密钥。本轮已在浏览器以 1200×772 视口渲染空目录状态。生产界面使用官方插件配置插槽，不用 HTML 替换 DSH 页面。
