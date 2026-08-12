import { makeFunctionReference } from "convex/server";
import type { Locale } from "@/lib/i18n";
import type { OfficialNewsPayload } from "@/lib/clash/news";

export const officialNewsAction = makeFunctionReference<
  "action",
  { locale: Locale; force?: boolean },
  OfficialNewsPayload
>("clash/news:getOfficialNews");
