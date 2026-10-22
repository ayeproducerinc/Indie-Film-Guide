/** Format complete U.S. numbers without discarding invalid or unfinished input. */
export function formatPhone(value: string): string {
  const trimmed = value.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return value;
  const digits = trimmed.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return value;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}
