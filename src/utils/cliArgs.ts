export interface DefaultInput {
  name: string;
  comment: string;
  value: string;
  inputType: string;
  comboboxData: string;
}

export function buildCliArgs(
  defaultInputs: DefaultInput[],
  cliArgs: string
): string {
  const inputArgs = defaultInputs
    .filter((d) => d.value.trim() !== "")
    .map((d) => `--input ${d.name}=${d.value}`)
    .join(" ");
  const extraArgs = cliArgs.trim();
  return [inputArgs, extraArgs].filter(Boolean).join(" ");
}

export function parseDefaultInputsJson(json: string): DefaultInput[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
