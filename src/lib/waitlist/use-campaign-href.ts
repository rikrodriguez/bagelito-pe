"use client";

import { useSearchParams } from "next/navigation";
import { readWaitlistCampaign, waitlistCampaignHref } from "./attribution";

export function useWaitlistCampaignHref() {
  const campaign = readWaitlistCampaign(useSearchParams());
  return (pack?: string) => waitlistCampaignHref(campaign, pack);
}
