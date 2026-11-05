import { PageLoader } from "@/components/common/page-loader";

/** Opening a page inside the event workspace: covers the main content only, the event sidebar stays. */
export default function EventWorkspaceLoading() {
    return <PageLoader text="Loading..." />;
}
