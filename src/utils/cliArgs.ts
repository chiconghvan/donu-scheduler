export interface DefaultInput {
  name: string;
  comment: string;
  value: string;
  inputType: string;
  comboboxData: string;
}

export type NormalizedInputType = "text" | "combobox" | "file";

export function normalizeInputType(inputType: string): NormalizedInputType {
  const normalized = inputType.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "combobox") return "combobox";
  if (normalized === "file" || normalized === "filebrowser" || normalized === "filechooser") return "file";
  return "text";
}

export function buildCliArgs(
  defaultInputs: DefaultInput[],
  cliArgs: string
): string {
  const inputArgs = defaultInputs
    .filter((d) => d.value.trim() !== "")
    .map((d) => `--input ${quoteCliArg(`${d.name}=${d.value}`)}`)
    .join(" ");
  const extraArgs = cliArgs.trim();
  return [inputArgs, extraArgs].filter(Boolean).join(" ");
}

function quoteCliArg(value: string): string {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function parseDefaultInputsJson(json: string): DefaultInput[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function parseCachedInputsOrDefault(
  cacheJson: string,
  defaultJson: string
): DefaultInput[] {
  const cached = parseDefaultInputsJson(cacheJson);
  const defaults = parseDefaultInputsJson(defaultJson);
  if (cached.length === 0) return defaults;

  const cachedByName = new Map(cached.map((input) => [input.name, input]));
  return defaults.map((input) => cachedByName.get(input.name) || input);
}
