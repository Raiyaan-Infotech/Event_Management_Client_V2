"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useMemo } from "react";
import { navMain } from "@/lib/navigation";
import { useClientEvent } from "@/hooks/use-client-events";

/** An event id in the path (/events/36/…, /messages/notification-templates/36): its name is shown instead. */
function eventIdIn(pathname: string | null): number | null {
  const m = pathname?.match(/\/(?:events|notification-templates)\/(\d+)(?:\/|$)/);
  return m ? Number(m[1]) : null;
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const screenParam = searchParams.get("screen");
  const eventId = eventIdIn(pathname);
  const { data: event } = useClientEvent(eventId);
  const eventName = event?.name?.trim() || null;

  const breadcrumbItems = useMemo(() => {
    const items: { label: string; url: string; isLast: boolean }[] = [
      { label: "Dashboard", url: "/dashboard", isLast: false }
    ];

    // Find the group and sub-item from navMain
    let foundGroup = null;
    let foundItem = null;

    for (const group of navMain) {
      const subItem = group.items?.find(item => item.url === pathname);
      if (subItem) {
        foundGroup = group;
        foundItem = subItem;
        break;
      }
    }

    if (foundGroup && foundItem) {
      // If it's a known group/item (Dashboards > Analytics, etc.)
      items.push({
        label: foundGroup.title,
        url: foundGroup.url === "#" ? pathname : foundGroup.url,
        isLast: false
      });
      items.push({
        label: foundItem.title,
        url: foundItem.url,
        isLast: !screenParam
      });

      // Handle internal submenus (like Event Builder screens)
      if (screenParam) {
        const screenLabel = screenParam.charAt(0).toUpperCase() + screenParam.slice(1).replace(/-/g, " ");
        items.push({
          label: screenLabel,
          url: `${pathname}?screen=${screenParam}`,
          isLast: true
        });
      }
    } else {
      // Fallback to segment-based breadcrumbs for pages not in navMain
      const segments = pathname?.split("/").filter(Boolean).filter(s => s !== "dashboard") || [];
      segments.forEach((segment, index) => {
        const url = `/dashboard/${segments.slice(0, index + 1).join("/")}`;
        // Known words keep their own spelling ("rsvps" → "RSVPs", not "Rsvps").
        const NAMES: Record<string, string> = { rsvps: "RSVPs" };
        // The event's id → its name ("36" → "Jamal And Fahmi"); the id stays until it loads.
        const label = eventName && eventId !== null && segment === String(eventId)
          ? eventName
          : NAMES[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
        items.push({ label, url, isLast: index === segments.length - 1 });
      });
    }

    // Double check last item is correct
    if (items.length > 0) {
      items.forEach((it, i) => it.isLast = i === items.length - 1);
    }

    return items;
  }, [pathname, screenParam, eventId, eventName]);

  // Current page title (last segment or 'Dashboard' as fallback)
  const currentTitle = breadcrumbItems[breadcrumbItems.length - 1]?.label || "Dashboard";

  return (
    <div className="h-[30px] flex items-center bg-card border-b border-border w-full px-2 md:px-4 min-w-0 overflow-hidden">
      <div className="flex-1 flex items-center min-w-0 text-[10px]">
        {/* Breadcrumb Links */}
        <div className="flex items-center gap-1 font-medium truncate min-w-0">
          {breadcrumbItems.map((item, index) => (
            <Fragment key={`${item.url}-${index}`}>
              {index > 0 && (
                <FontAwesomeIcon icon={faChevronRight} className="text-muted-foreground/50 !size-2 mx-1" />
              )}
              {item.isLast ? (
                <span className="text-primary font-bold truncate">{item.label}</span>
              ) : (
                <Link
                  href={item.url}
                  // py-1.5, not more: the bar itself is a fixed h-[30px]
                  // strip, so there is no room for a full 44px tap target
                  // without redesigning it. This still meaningfully grows the
                  // hit area and stays centered inside the bar.
                  className="py-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
