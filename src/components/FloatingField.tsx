import { useId } from "react";
import type { CSSProperties, ChangeEvent, ReactNode } from "react";

type FieldValue = string | number | readonly string[];

type FloatingInputProps = {
  label: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  readOnly?: boolean;
  style?: CSSProperties;
  type?: string;
  value?: FieldValue;
};

type FloatingSelectProps = {
  label: string;
  id?: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  style?: CSSProperties;
  value?: FieldValue;
};

export function FloatingInput({ label, id, className = "", min, placeholder, readOnly, style, ...props }: FloatingInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="compact-field" style={style}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className={className}
        placeholder={placeholder}
        min={min}
        readOnly={readOnly}
        {...props}
      />
    </div>
  );
}

export function FloatingSelect({ label, id, className = "", children, style, ...props }: FloatingSelectProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="compact-field" style={style}>
      <label htmlFor={inputId}>{label}</label>
      <select
        id={inputId}
        className={className}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
