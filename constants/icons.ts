import activity from "@/assets/icons/activity.png";
import add from "@/assets/icons/add.png";
import adobe from "@/assets/icons/adobe.png";
import back from "@/assets/icons/back.png";
import canva from "@/assets/icons/canva.png";
import claude from "@/assets/icons/claude.png";
import dropbox from "@/assets/icons/dropbox.png";
import figma from "@/assets/icons/figma.png";
import github from "@/assets/icons/github.png";
import home from "@/assets/icons/home.png";
import medium from "@/assets/icons/medium.png";
import menu from "@/assets/icons/menu.png";
import notion from "@/assets/icons/notion.png";
import openai from "@/assets/icons/openai.png";
import plus from "@/assets/icons/plus.png";
import setting from "@/assets/icons/setting.png";
import spotify from "@/assets/icons/spotify.png";
import wallet from "@/assets/icons/wallet.png";

export const icons = {
    home,
    wallet,
    setting,
    activity,
    add,
    back,
    menu,
    plus,
    notion,
    dropbox,
    openai,
    adobe,
    medium,
    figma,
    spotify,
    github,
    claude,
    canva,
} as const;

// Some brand presets have no bundled PNG asset — these render as a vector glyph
// from @expo/vector-icons' MaterialCommunityIcons set instead (confirmed present
// in the installed package), rather than adding new binary logo assets.
export const vectorIcons = {
    netflix: "netflix",
    youtube: "youtube",
} as const;

export type RasterIconKey = keyof typeof icons;
export type VectorIconKey = keyof typeof vectorIcons;
export type IconKey = RasterIconKey | VectorIconKey;

export const isVectorIcon = (key: string): key is VectorIconKey => key in vectorIcons;
export const isValidIconKey = (key: string): key is IconKey => key in icons || key in vectorIcons;