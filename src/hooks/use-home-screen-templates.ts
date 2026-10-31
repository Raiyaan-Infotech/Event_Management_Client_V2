import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * Mobile app home screen designs for the Create Event wizard (Step 1).
 *
 * Backend: GET /client/home-screen-templates?event_category_id=
 * (homeScreenTemplate.service.listForClient). Only ACTIVE templates come back.
 * `styles` are the style chips — built by the backend from the
 * Home Screen Categories master table (admin Template → Home Screen Categories), so nothing here hardcodes "Classic" / "Royal".
 */

export interface TemplateColor {
    key: 'primary' | 'secondary' | 'accent' | 'background' | 'text';
    label: string;
    hex: string;
}

export interface HomeTemplateStyle {
    id: number;
    name: string;
    slug: string;
}

export interface HomeScreenTemplate {
    id: number;
    name: string;
    description: string | null;
    event_category_id: number | null;
    home_screen_category_id: number | null;
    image_url: string | null;
    color_count: number;
    colors: TemplateColor[];
    eventCategory?: { id: number; name: string } | null;
    style?: (HomeTemplateStyle & { sort_order?: number }) | null;
}

export interface HomeScreenTemplateList {
    templates: HomeScreenTemplate[];
    styles: HomeTemplateStyle[];
}

export function useHomeScreenTemplates(eventCategoryId: string | number | null | undefined) {
    return useQuery({
        queryKey: ['client', 'home-screen-templates', String(eventCategoryId ?? '')],
        queryFn: () =>
            api.get<HomeScreenTemplateList>('/client/home-screen-templates', {
                event_category_id: eventCategoryId ?? undefined,
            }),
        enabled: !!eventCategoryId,
        staleTime: 5 * 60 * 1000,
    });
}
