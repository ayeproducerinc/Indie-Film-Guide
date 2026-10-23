import type { MailingContact } from "@workspace/db";

export const MAILING_CONSENT_VERSION = "ifg-email-updates-v1";
export const MAILING_CONSENT_TEXT = "I agree to receive email updates from Indie Film Guide. I can withdraw my consent by emailing support@ayeproducer.com.";
export const MAILING_RECEIVED = { message: "Thanks! Your opt-in request has been received." };

export function mailingContactView(row: MailingContact) {
  return {
    ...row, createdAt: row.createdAt.toISOString(), consentAt: row.consentAt.toISOString(),
    optedOutAt: row.optedOutAt?.toISOString() ?? null,
  };
}

function csvCell(value: string) {
  // Quoting alone does not prevent spreadsheet formula execution.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function mailingContactsCsv(rows: MailingContact[]) {
  const header = ["Email", "First name", "Signup date", "Consent date", "Consent version", "Consent text", "Source", "Status", "Email verified"];
  const records = rows.filter(row => row.status === "active").map(row => [
    row.email, row.firstName, row.createdAt.toISOString(), row.consentAt.toISOString(),
    row.consentVersion, row.consentText, row.source, row.status, "No (self-submitted opt-in)",
  ]);
  return "\uFEFF" + [header, ...records].map(record => record.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
