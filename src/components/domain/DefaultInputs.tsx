import type { DefaultInput } from "../../utils/cliArgs";

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

  return (
    <>
      {inputs.map((input, index) => (
        <div className="field" key={input.name}>
          <label className="field__label" title={input.comment || undefined}>
            {input.name}
          </label>
          {input.inputType === "Combobox" ? (
            <select
              className="select"
              value={input.value}
              onChange={(e) => updateValue(index, e.target.value)}
            >
              <option value="">-- Select --</option>
              {input.comboboxData
                .split("|")
                .filter(Boolean)
                .map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
            </select>
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
      ))}
    </>
  );
}
