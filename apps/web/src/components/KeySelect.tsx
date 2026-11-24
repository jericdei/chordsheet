"use client";

import { MAJOR_KEYS, MINOR_KEYS } from "@chordsheet/music";
import type { SelectHTMLAttributes } from "react";
import { Select } from "./ui";

export function KeySelect({
  value,
  onChange,
  includeEmpty,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value: string;
  onChange: (key: string) => void;
  /** Label for an empty option (e.g. "Original (G)"). */
  includeEmpty?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {includeEmpty !== undefined && <option value="">{includeEmpty}</option>}
      <optgroup label="Major">
        {MAJOR_KEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
      <optgroup label="Minor">
        {MINOR_KEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
