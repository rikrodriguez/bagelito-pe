// URL-only, declarative campaign attribution. No cookies, storage or third-party tracking.
export const WAITLIST_DIRECT_SOURCE = "waitlist_page";
export const WAITLIST_SOURCE_LIMIT = 384;
const prefix = "utm:v1:";
export const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type CampaignKey = (typeof campaignKeys)[number];
export type WaitlistCampaign = Partial<Record<CampaignKey, string>> & { utm_source: string };
export type CampaignSearchParams = Pick<URLSearchParams, "getAll"> | Readonly<Record<string, string | string[] | undefined>> | null | undefined;
const limits: Record<CampaignKey, number> = { utm_source: 32, utm_medium: 32, utm_campaign: 64, utm_content: 64, utm_term: 64 };

export function readWaitlistCampaign(params: CampaignSearchParams): WaitlistCampaign | null {
  if (!params) return null;
  const result: Partial<Record<CampaignKey, string>> = {};
  for (const key of campaignKeys) {
    const candidate = typeof (params as Pick<URLSearchParams, "getAll">).getAll === "function"
      ? (params as Pick<URLSearchParams, "getAll">).getAll(key)
      : (params as Readonly<Record<string, string | string[] | undefined>>)[key];
    const values = typeof candidate === "string" ? [candidate] : candidate;
    if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== "string") continue;
    const value = values[0].trim();
    // Campaign labels, not URLs, identities, scripts or spreadsheet formulas.
    if (!value || value.length > limits[key] || !/^[a-z0-9][a-z0-9 ._-]*$/i.test(value)) continue;
    result[key] = key === "utm_source" ? value.toLowerCase() : value;
  }
  return result.utm_source ? result as WaitlistCampaign : null;
}

function campaignParams(campaign: WaitlistCampaign | null): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of campaignKeys) if (campaign?.[key]) result.set(key, campaign[key]);
  return result;
}

export function waitlistCampaignSource(campaign: WaitlistCampaign | null): string {
  const validated = readWaitlistCampaign(campaign);
  return validated ? prefix + campaignParams(validated).toString() : WAITLIST_DIRECT_SOURCE;
}

export function campaignFromWaitlistSource(source: unknown): WaitlistCampaign | null {
  if (typeof source !== "string" || source.length > WAITLIST_SOURCE_LIMIT || !source.startsWith(prefix)) return null;
  const params = new URLSearchParams(source.slice(prefix.length));
  if ([...params.keys()].some(key => !campaignKeys.includes(key as CampaignKey))) return null;
  const campaign = readWaitlistCampaign(params);
  return campaign && waitlistCampaignSource(campaign) === source ? campaign : null;
}

export function isWaitlistSource(source: string): boolean {
  if (!source) return true; // Preserve the existing empty-source direct fallback.
  if (source.startsWith(prefix)) return campaignFromWaitlistSource(source) !== null;
  return source.length <= 80 && /^[a-z0-9][a-z0-9 ._-]*$/i.test(source);
}

function campaignHref(path: '/' | '/reserve' | '/waitlist', campaign: WaitlistCampaign | null, pack?: string): string {
  const params = new URLSearchParams();
  if (pack && /^(6|12)-(single|mixed)$/.test(pack)) params.set("pack", pack);
  for (const [key, value] of campaignParams(readWaitlistCampaign(campaign))) params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function waitlistCampaignHref(campaign: WaitlistCampaign | null, pack?: string): string {
  return campaignHref('/waitlist', campaign, pack);
}

export function reserveCampaignHref(campaign: WaitlistCampaign | null, pack?: string): string {
  return campaignHref('/reserve', campaign, pack);
}

export function packsCampaignHref(campaign: WaitlistCampaign | null): string {
  return campaignHref('/', campaign) + '#packs';
}
