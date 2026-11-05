import { PageLoader } from "@/components/common/page-loader";

/** Covers any dashboard route that sits outside the (dashboard) group. */
export default function Loading() {
    return <PageLoader fullScreen text="Loading..." />;
}
