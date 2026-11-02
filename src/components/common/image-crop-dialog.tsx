'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Loader2, RotateCcw, RotateCw, ZoomIn } from 'lucide-react';

import {
    Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * Crop a picked image before it is uploaded.
 *
 * ── WHY CROPPING AT ALL ─────────────────────────────────────────────────────
 * An avatar is rendered in a circle at a fixed size. Uploading the raw file
 * means the browser centre-crops whatever came off the camera — a 4:3 photo
 * loses its sides, a portrait loses the face. Choosing the crop is the whole
 * difference between "my photo" and "a piece of my photo".
 *
 * It also cuts what is stored: a modern phone photo is 3-8MB and would be
 * rejected by the 4MB cap, when the square that actually gets displayed is a
 * few dozen KB.
 *
 * ── crop-then-UPLOAD, not crop-then-save ────────────────────────────────────
 * This hands back a `File`, and the caller uploads it. The alternative — upload
 * first, crop the stored file afterwards — leaves the uncropped original on the
 * server, which is both wasted storage and a copy of a photo the person chose
 * not to publish.
 *
 * ── EXPORTED AS A DIALOG, NOT A PAGE ────────────────────────────────────────
 * So any upload point can use it without routing.
 */
export function ImageCropDialog({
    file,
    open,
    onOpenChange,
    onCropped,
    aspect = 1,
    outputSize = 512,
    title = 'Crop your photo',
    shape,
}: {
    /** The picked file. Null closes the dialog. */
    file: File | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Receives the cropped file, ready to upload. */
    onCropped: (file: File) => void;
    /** Width / height. 1 for a circular avatar. */
    aspect?: number;
    /** Longest edge of the exported image, in pixels. */
    outputSize?: number;
    title?: string;
    /** Crop frame. Default: round for 1:1 (avatars), else a rectangle. */
    shape?: 'round' | 'rect';
}) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [area, setArea] = useState<Area | null>(null);
    const [working, setWorking] = useState(false);

    const objectUrl = useObjectUrl(file);

    const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

    const confirm = async () => {
        if (!file || !area) return;
        setWorking(true);
        try {
            const cropped = await cropToFile(objectUrl!, area, file.name, outputSize, rotation);
            onCropped(cropped);
            onOpenChange(false);
        } finally {
            setWorking(false);
            // Reset, or reopening the dialog for a different photo starts at the
            // previous one's zoom and offset.
            setZoom(1);
            setRotation(0);
            setCrop({ x: 0, y: 0 });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Laid out like the mobile app's cropper: a coloured title bar, a dark
                crop area with grid lines, then rotate / zoom and the actions. */}
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[520px] [&>button]:text-primary-foreground">
                <div className="bg-primary px-4 py-3 text-primary-foreground">
                    <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
                    <DialogDescription className="text-[11.5px] text-primary-foreground/80">
                        Drag to move, zoom and rotate to fit.
                    </DialogDescription>
                </div>

                {/* The cropper fills its box absolutely — the box needs a real height. */}
                <div className="relative h-[340px] w-full bg-[#1b2333] sm:h-[380px]">
                    {objectUrl && (
                        <Cropper
                            image={objectUrl}
                            crop={crop}
                            zoom={zoom}
                            rotation={rotation}
                            aspect={aspect}
                            cropShape={shape ?? (aspect === 1 ? 'round' : 'rect')}
                            showGrid
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onRotationChange={setRotation}
                            onCropComplete={onCropComplete}
                        />
                    )}
                </div>

                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Rotate left"
                        onClick={() => setRotation((r) => (r - 90 + 360) % 360)}>
                        <RotateCcw className="size-4" />
                    </Button>
                    <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
                    <Label className="sr-only" htmlFor="crop-zoom">Zoom</Label>
                    <input
                        id="crop-zoom"
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                    />
                    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Rotate right"
                        onClick={() => setRotation((r) => (r + 90) % 360)}>
                        <RotateCw className="size-4" />
                    </Button>
                </div>

                <div className="flex justify-end gap-2 px-4 py-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={confirm} disabled={!area || working}>
                        {working && <Loader2 className="size-4 animate-spin" />}
                        Use photo
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * An object URL for the picked file, revoked when it changes or unmounts.
 *
 * Not revoking leaks the whole file into memory for the life of the tab, which
 * on a few 8MB photos is very noticeable.
 */
function useObjectUrl(file: File | null): string | null {
    const [url, setUrl] = useState<string | null>(null);
    const [seen, setSeen] = useState<File | null>(null);

    // Derived during render rather than in an effect, so the cropper has a URL
    // on its FIRST paint — an effect gives it one frame of an empty box.
    if (file !== seen) {
        if (url) URL.revokeObjectURL(url);
        setSeen(file);
        setUrl(file ? URL.createObjectURL(file) : null);
    }

    return url;
}

/**
 * Draw the chosen region onto a canvas and export it as a file.
 *
 * Exported as JPEG at 0.9 unless the source was a PNG, in which case PNG is
 * kept — a PNG avatar is usually a logo or a screenshot with flat colour, and
 * JPEG turns its edges to mush. Transparency is not preserved either way: the
 * canvas is filled white first, because a transparent avatar over a dark theme
 * renders as a hole.
 */
async function cropToFile(src: string, area: Area, name: string, size: number, rotation = 0): Promise<File> {
    const loaded = await loadImage(src);
    const image = rotation ? rotateImage(loaded, rotation) : loaded;

    // Never upscale: a 200px crop exported at 512 is just a blurry 200px crop
    // in a bigger file.
    const edge = Math.min(size, Math.round(Math.max(area.width, area.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(edge * (area.width / Math.max(area.width, area.height)));
    canvas.height = Math.round(edge * (area.height / Math.max(area.width, area.height)));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process that image.');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
        image,
        area.x, area.y, area.width, area.height,
        0, 0, canvas.width, canvas.height,
    );

    const isPng = /\.png$/i.test(name);
    const type = isPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, isPng ? undefined : 0.9),
    );
    if (!blob) throw new Error('Your browser could not process that image.');

    const base = name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.${isPng ? 'png' : 'jpg'}`, { type });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // The source is an object URL from the local file, so there is nothing
        // cross-origin to taint the canvas — toBlob cannot throw a SecurityError
        // here the way it would for a remote image.
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('That file could not be read as an image.'));
        img.src = src;
    });
}

/** The image turned by `deg`, on a canvas big enough to hold it. */
function rotateImage(img: HTMLImageElement, deg: number): HTMLCanvasElement {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * cos + h * sin);
    canvas.height = Math.round(w * sin + h * cos);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process that image.');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2);
    return canvas;
}
