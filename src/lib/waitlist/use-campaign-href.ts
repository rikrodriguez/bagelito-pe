"use client";

import { useSearchParams } from "next/navigation";
import { packsCampaignHref, readWaitlistCampaign, reserveCampaignHref, waitlistCampaignHref } from "./attribution";

export function useWaitlistCampaignHref() {
  const campaign = readWaitlistCampaign(useSearchParams());
  return (pack?: string) => waitlistCampaignHref(campaign, pack);
}

export function useReserveCampaignHref() {
  const campaign = readWaitlistCampaign(useSearchParams());
  return (pack?: string) => reserveCampaignHref(campaign, pack);
}

export function usePacksCampaignHref() {
  return packsCampaignHref(readWaitlistCampaign(useSearchParams()));
}
