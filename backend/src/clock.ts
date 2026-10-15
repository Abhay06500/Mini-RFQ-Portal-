/**
 * Single source of "current time" for the whole backend. All deadline checks go through now()
 * so tests can pin time to exact instants (just before, exactly at, just after a deadline)
 * without waiting in real time. Production code never calls setNow().
 */
let override: Date | null = null;

export function now(): Date {
  return override ? new Date(override.getTime()) : new Date();
}

export function setNow(value: Date | null): void {
  override = value;
}
