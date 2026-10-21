"use client";

import { type FormEvent, useId, useState } from "react";
import { pillClass } from "@/components/v2/primitives";
import type { GuardLimits } from "@/lib/contracts/animr-trade-guard";
import {
  LIMIT_FIELDS,
  LIMIT_PRESETS,
  type LimitsDraft,
  describeLimits,
  limitsToDraft,
  parseLimitsDraft,
  sameLimits,
} from "./setup-steps";

type LimitsFormProps = {
  /** Read once on mount: give the form a `key` to reset it. */
  initial: GuardLimits;
  /** While a transaction runs, or for viewers who can't send it. */
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (limits: GuardLimits) => void;
  onCancel?: () => void;
};

/** The owner's AnimrTradeGuard limits in human units (%, minutes), checked like configure() before sending. */
export function LimitsForm({ initial, disabled = false, submitLabel, onSubmit, onCancel }: LimitsFormProps) {
  const [draft, setDraft] = useState<LimitsDraft>(() => limitsToDraft(initial));
  const parsed = parseLimitsDraft(draft);
  const baseId = useId();
  const summaryId = `${baseId}-summary`;
  const activePreset = parsed.ok ? LIMIT_PRESETS.find((p) => sameLimits(p.limits, parsed.limits))?.id : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parsed.ok && !disabled) onSubmit(parsed.limits);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Limit presets">
        <span className="text-xs text-[var(--v2-faint)]">Start from</span>
        {LIMIT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activePreset === preset.id}
            disabled={disabled}
            onClick={() => setDraft(limitsToDraft(preset.limits))}
            className="v2-chip cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {LIMIT_FIELDS.map((field) => {
          const id = `${baseId}-${field.key}`;
          const invalid = !parsed.ok && parsed.field === field.key;
          return (
            <div key={field.key} className="v2-field content-start">
              <label htmlFor={id} className="v2-label flex items-baseline justify-between gap-2">
                {field.label}
                {field.ceiling && <span className="v2-help">{field.ceiling}</span>}
              </label>
              <div className="relative">
                <input
                  id={id}
                  value={draft[field.key]}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={disabled}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${id}-hint ${summaryId}`}
                  className="v2-input v2-num pr-14 text-[17px]"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-[var(--v2-faint)]">
                  {field.unit}
                </span>
              </div>
              <p id={`${id}-hint`} className="v2-help leading-relaxed">
                {field.hint}
              </p>
            </div>
          );
        })}
      </div>

      <p
        id={summaryId}
        role={parsed.ok ? undefined : "alert"}
        className={`mt-4 rounded-[var(--v2-r-md)] border px-3.5 py-2.5 text-[13px] leading-relaxed ${
          parsed.ok
            ? "border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.025)] text-[var(--v2-nav)]"
            : "border-[rgb(255_122_138/0.3)] bg-[rgb(255_122_138/0.08)] text-[var(--v2-danger)]"
        }`}
      >
        {parsed.ok ? describeLimits(parsed.limits) : parsed.error}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={disabled || !parsed.ok} className={pillClass("primary", "sm")}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={pillClass("ghost", "sm")}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
