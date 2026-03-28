# taiko-web-ui

> **wui** — short for **taiko-web-ui**

Web UI for [Taiko-C](https://github.com/LeHungryBoi/Taiko-C) drum controller — real-time sensor display and configuration via WebHID.

## 文件说明

- `display.html` — 原型（prototype），仅供参考
- `display_v2.html` — v2 版本，目前重构中

## 相关

- 固件：[Taiko-C]
- HID 协议 / 配置结构：见固件 [`docs/settings.md`]
- Web UI 模块文档：见 [`docs/`]

---

## 开发流程

功能以固件为主导，网页跟进实现，文档作为两边的契约：

1. **定义需求** — 在固件 `docs/` 中写明功能规格（HID report 格式、字节布局等）
2. **固件实现** — 实现功能，更新 `docs/settings.md`
3. **网页实现** — 按 spec 实现对应模块，更新 `docs/web_ui/` 中该模块的文档

### 模块化约定

- 每个功能对应 `web/` 下一个独立 `.js` 模块
- 每个模块在 `docs/web_ui/` 下有对应文档，说明接口、依赖、使用方式
- `display_v2.js` 只做顶层组合初始化，不含业务逻辑
- WebHID 连接逻辑统一在 `web/webhid.js`，其他模块通过它访问设备
