"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, CheckCircle2, ClipboardCheck, Loader2, QrCode, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionSheet, DetailRow, DetailSection, PersonSummary, StatusPill } from "@/components/module-kit";
import { ApiError } from "@/lib/api-client";
import { useDateFormatter } from "@/hooks/use-client-settings";
import {
    scanCheckIn, scanLookup, scanVerify, useRefreshAttendance, type ScannedParticipant,
} from "@/hooks/use-event-attendance";

/**
 * The two organizer scanners (Jamal, 2026-11-16 — V1's organizer scan, now in the portal because the
 * V2 app is participants-only): the participant opens My QR in the app, the organizer scans it here.
 *   Attendance   → details → Mark Present  (check-in, source "Event QR")
 *   Verification → details → Verify Entry  (verified, method "QR code")
 * Each is its own screen. The event QR (join / open the event) is unchanged.
 *
 * Reads the QR with the browser's own BarcodeDetector (Chrome / Edge on Android and most desktops).
 * Where the browser has none (iPhone Safari, Firefox) the screen says so.
 */

export type ScanMode = "attendance" | "verify";
type Phase = "starting" | "scanning" | "looking" | "found" | "saving" | "done" | "error" | "unsupported" | "no-camera";

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const COPY: Record<ScanMode, { title: string; subtitle: string; action: string; done: string; icon: typeof QrCode }> = {
    attendance: { title: "Scan Attendance", subtitle: "Scan the participant's QR code to mark them present.", action: "Mark Present", done: "Attendance marked", icon: ClipboardCheck },
    verify: { title: "Scan Verification", subtitle: "Scan the participant's QR code to verify their entry.", action: "Verify Entry", done: "Participant verified", icon: ShieldCheck },
};

export function AttendanceScanner({ eventId, mode, onClose }: { eventId: number; mode: ScanMode; onClose: () => void }) {
    const fmt = useDateFormatter();
    const refresh = useRefreshAttendance(eventId);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const busyRef = useRef(false);
    const [phase, setPhase] = useState<Phase>("starting");
    const [error, setError] = useState("");
    const [person, setPerson] = useState<ScannedParticipant | null>(null);
    const [already, setAlready] = useState(false);
    const [changed, setChanged] = useState(false);
    const copy = COPY[mode];

    const stopCamera = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    const onCode = useCallback(async (token: string) => {
        if (busyRef.current) return;
        busyRef.current = true;
        stopCamera();
        setPhase("looking");
        try {
            const p = await scanLookup(eventId, token);
            setPerson(p);
            setAlready(mode === "attendance" ? !!p.checked_in_at : !!p.verified_at);
            setPhase("found");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not read this QR code. Please try again.");
            setPhase("error");
        } finally {
            busyRef.current = false;
        }
    }, [eventId, mode, stopCamera]);

    const startCamera = useCallback(async () => {
        setPerson(null); setError(""); setAlready(false);
        const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (!Ctor) { setPhase("unsupported"); return; }
        if (!navigator.mediaDevices?.getUserMedia) { setPhase("no-camera"); return; }
        setPhase("starting");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
            video.srcObject = stream;
            await video.play().catch(() => {});
            const detector = new Ctor({ formats: ["qr_code"] });
            setPhase("scanning");
            timerRef.current = setInterval(async () => {
                if (busyRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
                try {
                    const codes = await detector.detect(videoRef.current);
                    const raw = codes.find((c) => c.rawValue)?.rawValue;
                    if (raw) void onCode(raw.trim());
                } catch { /* a frame that cannot be read — keep scanning */ }
            }, 300);
        } catch {
            setPhase("no-camera");
        }
    }, [onCode]);

    useEffect(() => {
        // Started from an effect so the <video> exists; the camera stops when the screen closes.
        void startCamera();
        return stopCamera;
    }, [startCamera, stopCamera]);

    const confirm = async () => {
        if (!person) return;
        setPhase("saving");
        try {
            if (mode === "attendance") {
                const r = await scanCheckIn(eventId, person.id);
                setPerson(r.participant);
                setAlready(r.already);
            } else {
                const r = await scanVerify(eventId, person.id);
                setPerson({ ...person, verified_at: r.participant.verified_at, verified_by_name: r.participant.verified_by_name, verify_method: r.participant.verify_method });
            }
            setChanged(true);
            setPhase("done");
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not save. Please try again.");
            setPhase("error");
        }
    };

    const close = () => {
        stopCamera();
        if (changed) refresh();
        onClose();
    };
    const scanNext = () => { void startCamera(); };
    const live = phase === "starting" || phase === "scanning";

    return (
        <ActionSheet open onClose={close} icon={copy.icon} tone={mode === "verify" ? "success" : "primary"} title={copy.title} subtitle={copy.subtitle}
            footer={(
                <>
                    <Button variant="outline" onClick={close}>Done</Button>
                    {phase === "found" && !already
                        ? <Button onClick={confirm}><copy.icon className="size-3.5" /> {copy.action}</Button>
                        : phase === "saving"
                            ? <Button disabled><Loader2 className="size-3.5 animate-spin" /> Saving...</Button>
                            : <Button disabled={live || phase === "looking" || phase === "unsupported"} onClick={scanNext}><RotateCcw className="size-3.5" /> {phase === "done" || phase === "found" ? "Scan Next" : "Scan Again"}</Button>}
                </>
            )}>
            {/* Camera — kept mounted so the stream has somewhere to go; hidden once a code is read. */}
            <div className={live ? "block" : "hidden"}>
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
                    <video ref={videoRef} playsInline muted className="size-full object-cover" />
                    <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                    {phase === "starting" && <p className="absolute inset-x-0 bottom-3 text-center text-[12.5px] text-white">Starting camera...</p>}
                </div>
                <p className="mt-2 text-center text-[12.5px] text-muted-foreground">Ask the participant to open <b>My QR</b> in the Event Invite app and hold it inside the frame.</p>
            </div>

            {phase === "looking" && <p className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking QR code...</p>}

            {(phase === "found" || phase === "saving" || phase === "done") && person && (
                <>
                    {phase === "done" && (
                        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-3 text-success">
                            <CheckCircle2 className="size-6 shrink-0" />
                            <div>
                                <p className="text-[14px] font-bold">{mode === "attendance" && already ? "Already checked in" : copy.done}</p>
                                <p className="text-[12px] text-foreground/80">{person.name} · {fmt(new Date(), true)}</p>
                            </div>
                        </div>
                    )}
                    {phase !== "done" && already && (
                        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
                            <TriangleAlert className="size-4 shrink-0" />
                            {mode === "attendance"
                                ? `Already checked in${person.checked_in_at ? ` at ${fmt(person.checked_in_at, true)}` : ""}${person.checked_in_by_name ? ` by ${person.checked_in_by_name}` : ""}.`
                                : `Already verified${person.verified_at ? ` at ${fmt(person.verified_at, true)}` : ""}${person.verified_by_name ? ` by ${person.verified_by_name}` : ""}.`}
                        </div>
                    )}
                    <PersonSummary
                        name={person.name} photo={person.photo}
                        sub={[person.relation, `Participant ID: ${person.participant_code}`].filter(Boolean).join(" · ")}
                        pills={<>
                            {person.verified_at ? <StatusPill tone="success" icon={ShieldCheck}>Verified</StatusPill> : <StatusPill tone="warning">Pending</StatusPill>}
                            {person.checked_in_at ? <StatusPill tone="success" icon={CheckCircle2}>Attended</StatusPill> : <StatusPill tone="danger">Not Attended</StatusPill>}
                        </>}
                    />
                    <DetailSection title="Participant Details">
                        <DetailRow label="Mobile">{person.mobile ? `${person.dial_code} ${person.mobile}` : null}</DetailRow>
                        <DetailRow label="Email">{person.email}</DetailRow>
                        <DetailRow label="Family / Group">{person.family_group}</DetailRow>
                        <DetailRow label="Party Size">{String(person.party_size || 1)}</DetailRow>
                    </DetailSection>
                </>
            )}

            {phase === "error" && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <TriangleAlert className="size-8 text-destructive" />
                    <p className="text-[13.5px] font-semibold">{error}</p>
                    <p className="text-[12px] text-muted-foreground">Press Scan Again to try another QR code.</p>
                </div>
            )}

            {phase === "unsupported" && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <CameraOff className="size-8 text-muted-foreground" />
                    <p className="text-[13.5px] font-semibold">This browser cannot scan QR codes</p>
                    <p className="text-[12px] text-muted-foreground">Please open the portal in Chrome on an Android phone (or Chrome / Edge on a computer) to scan.</p>
                </div>
            )}
            {phase === "no-camera" && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <CameraOff className="size-8 text-muted-foreground" />
                    <p className="text-[13.5px] font-semibold">Camera not available</p>
                    <p className="text-[12px] text-muted-foreground">Allow camera access for this site in your browser settings, then press Scan Again.</p>
                </div>
            )}
        </ActionSheet>
    );
}
