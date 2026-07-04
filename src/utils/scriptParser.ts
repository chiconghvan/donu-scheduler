import type { DefaultInput } from "./cliArgs";

export function collectInputNodes(nodes: any[]): DefaultInput[] {
  const results: DefaultInput[] = [];
  if (!Array.isArray(nodes)) return results;

  for (const node of nodes) {
    if (node.type === 1 && node.raw_input) {
      try {
        const rawInput = JSON.parse(node.raw_input);
        if (
          Array.isArray(rawInput) &&
          rawInput.some(
            (item: any) =>
              item.Key === "ALLOW_USER_INPUT" && item.Value === "True"
          )
        ) {
          const getVal = (key: string) =>
            rawInput.find((item: any) => item.Key === key)?.Value || "";
          results.push({
            name: node.output_variable_name || "",
            comment: node.comment || "",
            value: getVal("VALUE"),
            inputType: getVal("USER_INPUT_TYPE") || "Text",
            comboboxData: getVal("COMBOBOX_DATA"),
          });
        }
      } catch {
        // skip unparseable raw_input
      }
    }

    for (const key of ["nodes", "then_nodes", "else_nodes"]) {
      if (Array.isArray(node[key])) {
        results.push(...collectInputNodes(node[key]));
      }
    }
  }
  return results;
}

export function parseInputNodes(fileContent: string): DefaultInput[] {
  try {
    const cleaned = fileContent.replace(/^\uFEFF/, "");
    const root = JSON.parse(cleaned);

    if (Array.isArray(root)) {
      return collectInputNodes(root);
    }

    const results: DefaultInput[] = [];
    for (const section of ["before_init", "main_logic"]) {
      if (root[section] && Array.isArray(root[section].nodes)) {
        results.push(...collectInputNodes(root[section].nodes));
      }
    }
    return results;
  } catch {
    return [];
  }
}
