import assert from "node:assert/strict";

// Runtime-only credentials: never print the password, session cookie or access token.
// Creates and deletes only its own test records, leaving existing listings untouched.
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
let cookie = "";
const ownIds: number[] = [];
async function request(path: string, method = "GET", data?: unknown, admin = false, expected = 200) {
  const headers: Record<string, string> = { Origin: origin, "Content-Type": "application/json" };
  if (admin) { headers.Cookie = cookie; headers["X-IFG-Admin"] = "1"; }
  const response = await fetch(`${origin}/api${path}`, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expected, `${method} ${path}: unexpected response status`);
  return { response, body: response.status === 204 ? null : await response.json() as any };
}
async function main() {
  assert.ok(process.env.ADMIN_PASSWORD, "Admin password must be configured.");
  await request("/admin/dashboard", "GET", undefined, false, 401);
  await request("/admin/session", "POST", { password: "invalid-test-password" }, false, 403);
  await request("/admin/session", "POST", { password: "invalid-test-password" }, true, 401);
  const signedIn = await request("/admin/session", "POST", { password: process.env.ADMIN_PASSWORD }, true);
  assert.equal(signedIn.body.authenticated, true);
  cookie = signedIn.response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  assert.match(cookie, /^ifg_admin=/);
  const places = (await request("/locations")).body;
  const atlanta = places.find((p: any) => p.city === "Atlanta");
  assert.ok(atlanta?.id);
  const input = {
    name: `Verification only ${Date.now()}`, description: "Temporary verification record; removed when checks complete.",
    category: "Business & Licensing", stages: ["Idea"], coverage: "City", locationId: atlanta.id,
    website: "example.invalid", phone: "4045550100", email: "verification@example.invalid",
    providerType: "Government", plan: "Government", publicEmail: false,
  };
  // Use the actual category from the contract's public data, not an invented category.
  const directory = (await request("/directory")).body;
  input.category = directory.categories[0];
  await request("/submissions", "POST", { ...input, website: "" }, false, 400);
  await request("/submissions", "POST", { ...input, phone: "" }, false, 400);
  await request("/submissions", "POST", { ...input, website: "javascript:alert(1)" }, false, 400);
  await request("/submissions", "POST", { ...input, locationId: "not-a-census-city" }, false, 400);
  const saved = (await request("/submissions", "POST", input, false, 201)).body;
  await request(`/submissions/${saved.reference}/status`, "POST", { token: "0".repeat(64) }, false, 404);
  const status = (await request(`/submissions/${saved.reference}/status`, "POST", { token: saved.accessToken })).body;
  assert.equal(status.paymentStatus, "Not required");
  assert.equal(status.status, "Pending");
  let dash = (await request("/admin/dashboard", "GET", undefined, true)).body;
  let row = dash.listings.find((l: any) => l.reference === saved.reference);
  assert.ok(row);
  ownIds.push(row.id);
  assert.ok(!JSON.stringify(dash).includes("accessTokenHash"));
  assert.ok(!JSON.stringify(dash).includes(saved.accessToken));
  assert.equal(row.city, "Atlanta");
  assert.equal(row.state, "GA");
  assert.equal(row.website, "https://example.invalid/");
  assert.equal(row.phone, "+14045550100");
  let publicRows = (await request("/directory")).body.listings;
  assert.ok(!publicRows.some((l: any) => l.id === row.id));
  await request(`/admin/listings/${row.id}/status`, "POST", { status: "Live" }, true);
  let detail = (await request(`/listings/${row.slug}`)).body;
  assert.ok(!Object.hasOwn(detail, "email"));
  assert.ok(!JSON.stringify(detail).includes("verification@example.invalid"));
  const optedIn = (await request(`/admin/listings/${row.id}`, "PUT", { ...input, publicEmail: true }, true)).body;
  assert.equal(optedIn.publicEmail, true, "Admin edits must persist the opt-in.");
  detail = (await request(`/listings/${row.slug}`)).body;
  assert.equal(detail.email, input.email);
  await request(`/admin/listings/${row.id}`, "PUT", { ...input, publicEmail: false }, true);
  publicRows = (await request("/directory")).body.listings;
  assert.ok(!Object.hasOwn(publicRows.find((l: any) => l.id === row.id), "email"));
  const edited = (await request(`/admin/listings/${row.id}`, "PUT", { ...input, providerType: "Business", plan: "Standard" }, true)).body;
  assert.equal(edited.paymentStatus, "Unpaid");
  assert.equal(edited.status, "Pending");
  await request(`/admin/listings/${row.id}/status`, "POST", { status: "Live" }, true, 409);
  await request(`/listings/${row.slug}`, "GET", undefined, false, 404);
  await request(`/admin/listings/${row.id}/status`, "POST", { status: "Rejected" }, true);
  const added = (await request("/admin/listings", "POST", { ...input, name: `${input.name} admin added` }, true, 201)).body;
  ownIds.push(added.id);
  assert.equal(added.status, "Pending");
  await request(`/admin/listings/${added.id}/status`, "POST", { status: "Live" }, true);
  assert.equal((await request(`/listings/${added.slug}`)).body.name, added.name);
  console.log("PASS: protected admin login, CSRF, required contacts, canonical locations, submission access, private email, opt-in/out, review, unpaid approval block, add/edit/reject.");
}
try { await main(); }
finally {
  for (const id of ownIds) await request(`/admin/listings/${id}`, "DELETE", undefined, true, 204);
  if (cookie) {
    await request("/admin/session", "DELETE", undefined, true, 204);
    await request("/admin/dashboard", "GET", undefined, true, 401);
    console.log("PASS: test records removed; logout revoked the admin session.");
  }
}
