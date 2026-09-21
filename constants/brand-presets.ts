import { IconKey } from "./icons";

export type BrandPreset = { icon: IconKey; label: string; brandColor: string };

// The mobile app can only use icons already bundled as local assets
// (constants/icons.ts) — this is the curated subset of those that are actual
// service/brand logos, offered as presets when adding a subscription.
export const BRAND_PRESETS: BrandPreset[] = [
    { icon: "spotify", label: "Spotify", brandColor: "#1DB954" },
    { icon: "claude", label: "Claude", brandColor: "#DA7756" },
    { icon: "figma", label: "Figma", brandColor: "#A259FF" },
    { icon: "adobe", label: "Adobe", brandColor: "#FF0000" },
    { icon: "notion", label: "Notion", brandColor: "#9B9A97" },
    { icon: "github", label: "GitHub", brandColor: "#6E7681" },
    { icon: "dropbox", label: "Dropbox", brandColor: "#0061FF" },
    { icon: "openai", label: "OpenAI", brandColor: "#10A37F" },
    { icon: "medium", label: "Medium", brandColor: "#000000" },
    { icon: "canva", label: "Canva", brandColor: "#00C4CC" },
];

export const DEFAULT_BRAND_PRESET: BrandPreset = { icon: "wallet", label: "Other", brandColor: "#6b7280" };

export const findBrandPreset = (icon: IconKey): BrandPreset =>
    BRAND_PRESETS.find((preset) => preset.icon === icon) ?? DEFAULT_BRAND_PRESET;
