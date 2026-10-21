import { SubmitListingBody } from "@workspace/api-zod";
import locations from "../data/georgia-locations.json";

const locationMap = new Map(locations.map(location => [location.id, location]));
export class FieldError extends Error {
  constructor(public fields: Record<string, string[]>) {
    super(Object.values(fields)[0]?.[0] ?? "Check the form fields.");
  }
}
export function validateListing(body: unknown) {
  const parsed = SubmitListingBody.safeParse(body);
  if (!parsed.success) throw new FieldError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
  const input = parsed.data;
  const fail = (field: string, message: string): never => { throw new FieldError({ [field]: [message] }); };
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) fail("name", "Enter your business name.");
  if (!description) fail("description", "Describe what you offer.");
  const location = input.locationId ? locationMap.get(input.locationId) : undefined;
  if (input.coverage === "City" && !location) fail("locationId", "Choose a city from the Georgia suggestions.");
  if ((input.providerType === "Government") !== (input.plan === "Government"))
    fail("plan", "The free plan is available only to government offices.");
  const indieRateDetails = input.plan === "Indie Partner" ? input.indieRateDetails?.trim() ?? "" : "";
  if (input.plan === "Indie Partner" && !indieRateDetails) fail("indieRateDetails", "Describe your indie filmmaker rate.");
  let website = input.website.trim();
  if (!website) fail("website", "Enter your website.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(website)) website = `https://${website}`;
  try {
    const url = new URL(website);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error();
    website = url.toString();
  } catch { fail("website", "Enter a valid website, such as https://example.com."); }
  let phone = input.phone.trim();
  if (!phone) fail("phone", "Enter your phone number.");
  if (!/^[+\d\s().-]+$/.test(phone)) fail("phone", "Enter a valid U.S. phone number.");
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) phone = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) phone = `+${digits}`;
  else fail("phone", "Enter a 10-digit U.S. phone number.");
  return {
    name, description, category: input.category, stages: [...new Set(input.stages)],
    coverage: input.coverage, locationId: input.coverage === "City" ? location!.id : null,
    city: input.coverage === "City" ? location!.city : input.coverage,
    state: input.coverage === "Nationwide" ? "" : "GA",
    website, phone, email: input.email.trim().toLowerCase(), publicEmail: input.publicEmail ?? false,
    providerType: input.providerType, indieRate: input.plan === "Indie Partner",
    indieRateDetails, plan: input.plan,
  };
}
