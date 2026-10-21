"use client";

import { type FormEvent, useId, useState } from "react";
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-subtle">Start from</span>
        {LIMIT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activePreset === preset.id}
            disabled={disabled}
            onClick={() => setDraft(limitsToDraft(preset.limits))}
            className={`chip transition-colors hover:border-accent hover:text-foreground disabled:opacity-50 ${
              activePreset === preset.id ? "border-accent bg-accent/15 text-foreground" : ""
            }`}
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
            <div key={field.key}>
              <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
                {field.label}
                {field.ceiling && <span className="text-xs font-normal text-subtle">{field.ceiling}</span>}
              </label>
              <div className="relative mt-1.5">
                <input
                  id={id}
                  value={draft[field.key]}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={disabled}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${id}-hint ${summaryId}`}
                  className={`input pr-12 font-mono ${invalid ? "border-danger" : ""}`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-subtle">
                  {field.unit}
                </span>
              </div>
              <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-subtle">
                {field.hint}
              </p>
            </div>
          );
        })}
      </div>

      <p
        id={summaryId}
        role={parsed.ok ? undefined : "alert"}
        className={`mt-4 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
          parsed.ok ? "border-line bg-surface-2/60 text-muted" : "border-danger/30 bg-danger/10 text-danger"
        }`}
      >
        {parsed.ok ? describeLimits(parsed.limits) : parsed.error}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={disabled || !parsed.ok} className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
