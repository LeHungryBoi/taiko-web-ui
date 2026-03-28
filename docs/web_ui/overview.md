# Web UI 模块文档

## 模块列表

| 模块 | 文件 | 说明 |
|------|------|------|
| WebHID 连接层 | `web/webhid.js` | 设备连接、Input Report 监听，供其他模块共用 |
| 实时传感器显示 | `web/gamepad_diagnostics.js` | 读取 Input Report，实时显示传感器数值 |
| 设置编辑器 | `web/settings_editor.js` | 通过 Feature Report 读写 `threshold` / `button_map` |

顶层入口 `web/display_v2.js` 只做组合初始化：
```js
import { initWebHID } from "./webhid.js";
import { initGamepadDiagnostics } from "./gamepad_diagnostics.js";
import { initSettingsEditor } from "./settings_editor.js";
```

## 各模块文档

- [`webhid.md`](./webhid.md)
- [`gamepad_diagnostics.md`](./gamepad_diagnostics.md)
- [`settings_editor.md`](./settings_editor.md)

## 固件协议参考

HID report 格式、Feature Report 字节布局、配置结构见固件：
[Taiko-C / docs/settings.md](https://github.com/LeHungryBoi/Taiko-C/blob/main/docs/settings.md)
