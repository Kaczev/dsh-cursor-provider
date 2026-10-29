# 导航

- [交接入口](HANDOFF.md)：原始约束、SDK 与宿主契约研究。
- [使用与验证](README.md)：配置入口、限制及验证状态。
- [配置视觉参考](design/cursor-provider.html)：插件配置面板的离线参考。
- [Host 入口](src/index.js)：配置 schema、凭据解析及供应商注册。
- [Client 面板](src/client.js)：官方配置插槽、主题变量、凭据写入与模型目录。
- [适配器](src/adapter.js)：模型目录筛选、DSH 流映射、有限协议纠正与重放记录。
- [图片消息](src/images.js)：附件校验读取、SDK 图片序列化与历史出现位置。
- [SDK transport](src/transport.js)：官方 SDK 生命周期。
- [协议与状态](src/provider.js)：工具块解析、模型变体及隔离辅助逻辑。
- [构建](scripts/build.mjs)：语法检查和模块复制；测试位于 test/。
