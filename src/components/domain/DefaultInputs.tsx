import { openFileDialog } from "../../api";
import { normalizeInputType, type DefaultInput } from "../../utils/cliArgs";

interface DefaultInputsProps {
  inputs: DefaultInput[];
  onChange: (inputs: DefaultInput[]) => void;
}

export default function DefaultInputs({ inputs, onChange }: DefaultInputsProps) {
  const updateValue = (index: number, value: string) => {
    const next = inputs.map((input, i) =>
      i === index ? { ...input, value } : input,
    );
    onChange(next);
  };

  const chooseFile = async (index: number) => {
    const path = await openFileDialog("All Files", []);
    if (path) updateValue(index, path);
  };

  const parseComboboxOptions = (value: string) =>
    value
      .split(/[|,]/)
      .map((option) => option.trim())
      .filter(Boolean);

  return (
    <>
      {inputs.map((input, index) => {
        const inputType = normalizeInputType(input.inputType);
        return (
          <div className="field" key={`${input.name}-${index}`}>
            <label className="field__label" title={input.comment || undefined}>
              {input.name}
            </label>
            {inputType === "combobox" ? (
              <select
                className="select"
                value={input.value}
                onChange={(e) => updateValue(index, e.target.value)}
              >
                <option value="">-- Select --</option>
                {parseComboboxOptions(input.comboboxData).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : inputType === "file" ? (
              <div className="input-action-row">
                <input
                  className="input"
                  type="text"
                  value={input.value}
                  onChange={(e) => updateValue(index, e.target.value)}
                  placeholder={input.comment || input.name}
                />
                <button className="btn btn--secondary" type="button" onClick={() => void chooseFile(index)}>
                  Browse
                </button>
              </div>
            ) : (
              <input
                className="input"
                type="text"
                value={input.value}
                onChange={(e) => updateValue(index, e.target.value)}
                placeholder={input.comment || input.name}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
