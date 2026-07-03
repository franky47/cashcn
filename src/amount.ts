import { InvalidAmountError } from "./errors.ts";
import type { Amount, Interval } from "./types.ts";

// Parse the amount token: `100`, `10/m`, `25/y`, `10/month`, `5/yr`.
// A bare recurrence (`/m`, `/y`) is an amountless donation — the checkout opens
// with the right frequency and the user picks the amount there.
// The leading `$` is intentionally dropped by the user to dodge shell expansion,
// but we tolerate it if it sneaks through quoting.

const INTERVAL_ALIASES: Record<string, Interval> = {
  m: "month",
  mo: "month",
  month: "month",
  monthly: "month",
  y: "year",
  yr: "year",
  year: "year",
  yearly: "year",
};

export function parseAmount(token: string): Amount | InvalidAmountError {
  if (!token) {
    return new InvalidAmountError({
      reason: "Missing amount (e.g. `100`, `10/m`, `25/y`).",
    });
  }
  const cleaned = token.trim().replace(/^\$/, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)?(?:\/([a-z]+))?$/i);
  if (!match || (!match[1] && !match[2])) {
    return new InvalidAmountError({
      reason: `Invalid amount "${token}". Use a number, optionally suffixed with /m or /y (e.g. 10/m), or a bare /m for an amountless donation.`,
    });
  }
  let value: number | null = null;
  if (match[1]) {
    value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
      return new InvalidAmountError({
        reason: `Amount must be a positive number, got "${token}".`,
      });
    }
  }
  if (!match[2]) return { value, interval: "once" };

  const interval = INTERVAL_ALIASES[match[2].toLowerCase()];
  if (!interval) {
    return new InvalidAmountError({
      reason: `Unknown recurrence "/${match[2]}". Use /m (monthly) or /y (yearly).`,
    });
  }
  return { value, interval };
}
