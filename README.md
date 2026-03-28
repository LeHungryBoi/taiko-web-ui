# taiko-web-ui

> **wui** — short for **w**eb **u**ser **i**nterface

Web UI for [Taiko-C](https://github.com/LeHungryBoi/Taiko-C) drum controller — real-time sensor display and configuration.

## 文件说明

- `display.html` — 原型（prototype），仅供参考
- `display_v2.html` — v2 版本，目前重构中

## 相关

- 固件：[Taiko-C](https://github.com/LeHungryBoi/Taiko-C)

## 当前固件配置（`drum_config`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `threshold[4]` | `uint8_t` | 每个传感器触发阈值（0–255），默认全部 30 |
| `button_map[4]` | `uint16_t` | 每个传感器对应的 HID button bitmask，默认 0x0001/0x0002/0x0004/0x0008 |

传感器顺序：左内 / 左外 / 右内 / 右外（GPIO 26–29）
