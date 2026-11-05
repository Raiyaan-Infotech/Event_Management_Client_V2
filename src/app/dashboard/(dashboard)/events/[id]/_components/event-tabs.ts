"use client";

import {
    FileText, Heart, History, Images, LayoutDashboard, ListChecks, Mail, MapPin, Radio, Settings, Share2, SquareCheck,
    UserRound, Users, UsersRound, type LucideIcon,
} from "lucide-react";
import { useEventOptions } from "@/hooks/use-client-portal";
import { EVENT_SECTIONS, grantedSections } from "@/lib/navigation";
import type { DerivedStatus } from "@/hooks/use-client-events";

/**
 * An event's sections — the event page's tabs and the event workspace's
 * sidebar (Jamal, 2026-11-04: "View Event" opens its own tab with this menu;
 * Overview is now "Dashboard").
 */
export const EVENT_TABS = [
    { value: "overview", label: "Dashboard" },
    { value: "information", label: "Event Information" },
    { value: "agenda", label: "Agenda" },
    { value: "venue", label: "Venue" },
    { value: "gallery", label: "Gallery" },
    { value: "family", label: "Family" },
    { value: "wishes", label: "Wed Wishes" },
    { value: "live", label: "Live Streaming" },
    { value: "social", label: "Social Links" },
    { value: "guests", label: "Guests" },
    { value: "rsvps", label: "RSVPs" },
    { value: "participants", label: "Participants" },
    { value: "settings", label: "Menu Settings" },
    { value: "messages", label: "Messages" },
    { value: "activity", label: "Activity Log" },
] as const;

export type EventTab = (typeof EVENT_TABS)[number]["value"];

export const EVENT_TAB_ICONS: Record<EventTab, LucideIcon> = {
    overview: LayoutDashboard, information: FileText, agenda: ListChecks, venue: MapPin, gallery: Images, family: Users,
    wishes: Heart, live: Radio, social: Share2, guests: UserRound, rsvps: SquareCheck, participants: UsersRound,
    settings: Settings, messages: Mail, activity: History,
};

export const EVENT_STATUS: Record<DerivedStatus, { label: string; dot: string; className: string }> = {
    live: { label: "Live", dot: "bg-destructive", className: "bg-destructive/10 text-destructive" },
    upcoming: { label: "Upcoming", dot: "bg-success", className: "bg-success/12 text-success" },
    past: { label: "Completed", dot: "bg-muted-foreground", className: "bg-muted text-muted-foreground" },
    draft: { label: "Draft", dot: "bg-warning", className: "bg-warning/15 text-warning" },
    cancelled: { label: "Cancelled", dot: "bg-foreground/50", className: "bg-foreground/10 text-foreground/70" },
};

/** `?tab=` → a known tab ("schedule" is the old name of Agenda). */
export const tabFrom = (asked: string | null): EventTab => {
    const wanted = asked === "schedule" ? "agenda" : asked;
    return (EVENT_TABS.find((t) => t.value === wanted)?.value ?? "overview") as EventTab;
};

/** The tabs this client's plan grants (Guests / RSVPs / Participants are plan sections). */
export function useVisibleEventTabs() {
    const planOptions = useEventOptions();
    const granted = grantedSections(planOptions.data);
    return EVENT_TABS.filter((t) => {
        const gate = EVENT_SECTIONS.find((e) => e.tab === t.value);
        return !gate || (!!planOptions.data && granted.has(gate.section));
    });
}

/**
 * Menu Settings (Jamal, 2026-11-05): every module's settings in one place —
 * `?tab=settings&set=<key>` opens one, `?tab=settings` shows them all. RSVP /
 * Participants follow the plan like their modules. Guests have no settings.
 */
export const SETTINGS_PAGES = [
    { key: "rsvp", label: "RSVP Settings", gate: "rsvp" },
    { key: "participants", label: "Participants Settings", gate: "participants" },
    { key: "family", label: "Family Settings" },
    { key: "wishes", label: "Wish Settings" },
    { key: "contact", label: "Contact Person" },
] as const;

export type SettingsKey = (typeof SETTINGS_PAGES)[number]["key"];

export const settingsFrom = (asked: string | null): SettingsKey | null =>
    SETTINGS_PAGES.find((p) => p.key === asked)?.key ?? null;

/** The settings pages this client's plan grants. */
export function useVisibleSettingsPages() {
    const planOptions = useEventOptions();
    const granted = grantedSections(planOptions.data);
    return SETTINGS_PAGES.filter((p) => !("gate" in p) || (!!planOptions.data && granted.has(p.gate)));
}
