import { useEffect, useState } from "react";
import type { Script, ScriptInput } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

interface DefaultInput {
  name: string;
  comment: string;
  value: string;
  inputType: string;
  comboboxData: string;
}

const emptyInput: ScriptInput = {
  name: "",
  description: "",
  script_path: "",
  default_args: "",
  default_inputs_json: "[]",
};

function collectInputNodes(nodes: any[]): DefaultInput[] {
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

    // Recurse into nested block types
    for (const key of ["nodes", "then_nodes", "else_nodes"]) {
      if (Array.isArray(node[key])) {
        results.push(...collectInputNodes(node[key]));
      }
    }
  }
  return results;
}

function parseInputNodes(fileContent: string): DefaultInput[] {
  try {
    const cleaned = fileContent.replace(/^\uFEFF/, "");
    const root = JSON.parse(cleaned);

    // Top-level array
    if (Array.isArray(root)) {
      return collectInputNodes(root);
    }

    // Object with before_init / main_logic sections
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

export default function ScriptsPage() {
  const dialog = useDialog();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [form, setForm] = useState<ScriptInput>(emptyInput);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultInputs, setDefaultInputs] = useState<DefaultInput[]>([]);

  const load = async () => {
    try {
      setScripts(await api.listScripts());
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleBrowseFile = async () => {
    try {
      const path = await api.openFileDialog("GPM Scripts", ["gscript", "json"]);
      if (path) {
        setForm({ ...form, script_path: path });
        await loadInputsFromFile(path);
      }
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const loadInputsFromFile = async (path: string) => {
    try {
      const content = await api.readFileContent(path);
      const inputs = parseInputNodes(content);
      setDefaultInputs(inputs);
      setForm((prev) => ({
        ...prev,
        default_inputs_json: JSON.stringify(inputs),
      }));
    } catch (e: unknown) {
      await dialog.showError(`Failed to read script file: ${e}`);
    }
  };

  const handleDefaultInputChange = (index: number, value: string) => {
    setDefaultInputs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value };
      setForm((f) => ({
        ...f,
        default_inputs_json: JSON.stringify(updated),
      }));
      return updated;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editId) {
        await api.updateScript(editId, form);
      } else {
        await api.createScript(form);
      }
      setForm(emptyInput);
      setDefaultInputs([]);
      setEditId(null);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await dialog.showDialog({
      kind: "confirm",
      title: "Delete script",
      message: "Delete this script?",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!ok) return;
    try {
      await api.deleteScript(id);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const handleEdit = (s: Script) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      description: s.description,
      script_path: s.script_path,
      default_args: s.default_args,
      default_inputs_json: s.default_inputs_json,
    });
    try {
      setDefaultInputs(JSON.parse(s.default_inputs_json || "[]"));
    } catch {
      setDefaultInputs([]);
    }
  };

  const handleCancel = () => {
    setEditId(null);
    setForm(emptyInput);
    setDefaultInputs([]);
  };

  return (
    <div>
      <h1>Scripts</h1>

      <div className="card">
        <h2>{editId ? "Edit Script" : "Add Script"}</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Script"
            />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Script Path</label>
            <div className="flex-row">
              <input
                value={form.script_path}
                onChange={(e) =>
                  setForm({ ...form, script_path: e.target.value })
                }
                placeholder="C:\scripts\auto-post.gscript"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleBrowseFile}
                style={{ marginLeft: 4, whiteSpace: "nowrap" }}
              >
                Browse
              </button>
            </div>
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Auto post script"
          />
        </div>
        <div className="form-group">
          <label>Default Args</label>
          <textarea
            rows={3}
            value={form.default_args}
            onChange={(e) =>
              setForm({ ...form, default_args: e.target.value })
            }
          />
        </div>

        {defaultInputs.length > 0 && (
          <div className="form-group">
            <label>Default Inputs (auto-detected from script)</label>
            {defaultInputs.map((input, idx) => (
              <div key={input.name} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "#8899b0",
                    marginBottom: 4,
                  }}
                >
                  {input.name} — {input.comment}
                </div>
                {input.inputType === "ComboBox" ? (
                  <select
                    value={input.value}
                    onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">-- select --</option>
                    {input.comboboxData
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                ) : input.inputType === "File" ? (
                  <div className="flex-row">
                    <input
                      value={input.value}
                      onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
                      placeholder="select a file"
                      style={{ flex: 1 }}
                      readOnly
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        const path = await api.openFileDialog("All Files", ["*"]);
                        if (path) handleDefaultInputChange(idx, path);
                      }}
                      style={{ marginLeft: 4, whiteSpace: "nowrap" }}
                    >
                      Browse
                    </button>
                  </div>
                ) : (
                  <input
                    value={input.value}
                    onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
                    placeholder="default value"
                    style={{ width: "100%" }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex-row">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.script_path}
          >
            {editId ? "Update" : "Create"}
          </button>
          {editId && (
            <button className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Script List ({scripts.length})</h2>
        {scripts.length === 0 ? (
          <p className="text-muted">No scripts yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Path</th>
                <th>Description</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {s.script_path}
                  </td>
                  <td>{s.description}</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex-row">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(s)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
