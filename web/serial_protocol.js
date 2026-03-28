export const USB_VENDOR_ID = 0xF7C0;
export const USB_PRODUCT_ID = 0xFAD1;
export const SERIAL_BAUD_RATE = 115200;

export const COMMANDS = Object.freeze({
  GET: "GET",
  SAVE: "SAVE",
  RESET: "RESET",
  FACTORY_RESET: "FACTORY_RESET",
  SET_DEADZONE: "SET DEADZONE",
  SET_INVERT: "SET INVERT",
  SET_THRESHOLD: "SET THR",
  SET_PRESS_TICKS: "SET PT",
  SET_REFRACTORY: "SET RP",
});

function clampInt(value, min, max) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function parseList(raw, fallback = 0, min = 0, max = 255) {
  const values = Array.from({ length: 4 }, () => fallback);
  if (!raw) return values;

  raw
    .split(",")
    .slice(0, 4)
    .forEach((item, index) => {
      values[index] = clampInt(item, min, max);
    });

  return values;
}

function parsePayload(payload) {
  const result = {
    deadzone: 0,
    invert: [0, 0, 0, 0],
    press_threshold: [0, 0, 0, 0],
    press_ticks: [1, 1, 1, 1],
    refractory_ticks: [1, 1, 1, 1],
  };

  const parts = payload.trim().split(/\s+/);
  for (const part of parts) {
    const [key, rawValue] = part.split("=");
    if (!rawValue) continue;

    switch (key) {
      case "dz":
      case "deadzone":
        result.deadzone = clampInt(rawValue, 0, 255);
        break;
      case "inv":
      case "invert":
        result.invert = parseList(rawValue, 0, 0, 1);
        break;
      case "thr":
      case "threshold":
        result.press_threshold = parseList(rawValue, 0, 0, 255);
        break;
      case "pt":
      case "press":
        result.press_ticks = parseList(rawValue, 1, 1, 255);
        break;
      case "rp":
      case "refractory":
        result.refractory_ticks = parseList(rawValue, 1, 1, 255);
        break;
      default:
        break;
    }
  }

  return result;
}

export function parseBoardLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("CURRENT ")) {
    return { type: "settings", scope: "current", settings: parsePayload(trimmed.slice(8)) };
  }

  if (trimmed.startsWith("DEFAULTS ")) {
    return { type: "settings", scope: "defaults", settings: parsePayload(trimmed.slice(9)) };
  }

  if (trimmed.startsWith("STORAGE ")) {
    const payload = parsePayload(trimmed.slice(8));
    const stateMatch = trimmed.match(/state=([^\s]+)/);
    const state = stateMatch ? stateMatch[1] : "error";
    return {
      type: "storage",
      state,
      warning: state !== "ok",
      payload,
    };
  }

  if (trimmed === "OK") {
    return { type: "ack", command: "OK" };
  }

  if (trimmed === "SAVED") {
    return { type: "ack", command: COMMANDS.SAVE };
  }

  if (trimmed === "FACTORY_RESET") {
    return { type: "ack", command: COMMANDS.FACTORY_RESET };
  }

  if (trimmed === "RESET") {
    return { type: "ack", command: COMMANDS.RESET };
  }

  if (trimmed === "ERR") {
    return { type: "error", message: "ERR" };
  }

  return { type: "other", raw: trimmed };
}

export function buildSettingCommands(settings) {
  const lines = [COMMANDS.SET_DEADZONE + " " + settings.deadzone];

  for (let axis = 0; axis < 4; axis += 1) {
    lines.push(`${COMMANDS.SET_INVERT} ${axis} ${settings.invert[axis] ? 1 : 0}`);
    lines.push(`${COMMANDS.SET_THRESHOLD} ${axis} ${settings.press_threshold[axis]}`);
    lines.push(`${COMMANDS.SET_PRESS_TICKS} ${axis} ${settings.press_ticks[axis]}`);
    lines.push(`${COMMANDS.SET_REFRACTORY} ${axis} ${settings.refractory_ticks[axis]}`);
  }

  lines.push(COMMANDS.SAVE);
  return lines;
}

export function buildSnapshotCommands() {
  return [COMMANDS.GET];
}

export function buildFactoryResetCommands() {
  return [COMMANDS.FACTORY_RESET, COMMANDS.GET];
}

export function isStorageWarningState(state) {
  return state !== "ok";
}

export function isStorageErrorState(state) {
  return state === "error";
}

export function storageStateLabel(state) {
  switch (state) {
    case "ok":
      return "Storage healthy.";
    case "recovered_missing":
      return "Storage was missing. Defaults were restored.";
    case "recovered_invalid":
      return "Storage file was invalid. Defaults were restored.";
    case "recovered_format":
      return "Storage partition was reformatted and defaults were restored.";
    case "error":
      return "Storage repair failed. Use the red repair button.";
    default:
      return `Storage state: ${state}`;
  }
}

export function storageStateTone(state) {
  if (state === "ok") return "ok";
  if (state === "error") return "error";
  return "warn";
}
