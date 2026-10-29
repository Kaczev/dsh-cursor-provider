# 导航

- [交接入口](HANDOFF.md)：原始约束、SDK 与宿主契约研究。
- [使用与验证](README.md)：配置入口、限制及验证状态。
- [MIT 许可](LICENSE)：项目使用、修改及分发许可。
- [配置视觉参考](design/cursor-provider.html)：插件配置面板的离线参考。
- [Host 入口](src/index.js)：配置 schema、凭据解析及供应商注册。
- [Client 面板](src/client.js)：官方配置插槽、主题变量、凭据写入与模型目录。
- [适配器](src/adapter.js)：模型目录、DSH 流映射和原生工具续接；不再解析正文工具标签或要求模型纠正。
- [原生工具桥](src/native.js)：保留工具原名、校验结果批次并回传有来源的 runtime-context 快照；回调不执行宿主工具。
- [桥接测试](test/native.test.js)：真实宿主流记录器、连续工具续接、快照替换、审批拒绝、卸载和 send 阻塞路径。
- [命名测试](test/native-names.test.js)：语义名、含点名称、重排及重复名拒绝。
- [图片消息](src/images.js)：附件校验读取、SDK 图片序列化与历史出现位置。
- [SDK transport](src/transport.js)：官方 SDK 生命周期。
- [协议与状态](src/provider.js)：工具块解析、模型变体及隔离辅助逻辑。
- [构建](scripts/build.mjs)：语法检查和模块复制；测试位于 test/。
