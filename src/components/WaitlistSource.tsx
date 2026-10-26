import { campaignFromWaitlistSource, isWaitlistSource, WAITLIST_DIRECT_SOURCE } from "@/lib/waitlist/attribution";

export function WaitlistSource({ source }: { source: string }) {
  const campaign = campaignFromWaitlistSource(source);
  const channel = campaign?.utm_source;
  const origin = channel === "instagram" ? "Instagram" : channel === "tiktok" ? "TikTok" : channel;
  const legacy = !source || source === WAITLIST_DIRECT_SOURCE ? "Direct / waitlist" : isWaitlistSource(source) ? source : "Unknown";
  const fields = [["Source", origin ?? legacy], ["Medium", campaign?.utm_medium],
    ["Campaign", campaign?.utm_campaign], ["Content", campaign?.utm_content], ["Term", campaign?.utm_term]];
  return (
    <dl className="waitlist-attribution" aria-label="Lead attribution">
      {fields.filter(([, value]) => value).map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}
