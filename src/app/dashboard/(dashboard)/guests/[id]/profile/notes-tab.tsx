'use client';

import { useState } from 'react';
import {
    Pin, PinOff, Plus, Trash2, Pencil, Bell, BellOff, Tag as TagIcon,
    X, Check, StickyNote, Loader2,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import {
    useCreateNote, useUpdateNote, useDeleteNote,
    useAddTag, useRemoveTag,
    useCreateReminder, useUpdateReminder, useDeleteReminder,
    NOTE_CATEGORIES, CATEGORY_STYLE, TINT_STYLE, REMINDER_STYLE, REMINDER_LABEL,
    type GuestProfile, type GuestNote, type NoteCategory,
} from '@/hooks/use-guest-profile';
import { RichTextEditor, htmlIsEmpty } from '@/components/common/rich-text-editor';
import { SectionHeading, Empty } from './guest-profile';

type Fmt = (v: string | number | Date | null | undefined, withTime?: boolean) => string;

/**
 * Notes, tags and reminders.
 *
 * ── ⚠ THESE ARE THE HOST'S NOTES, NOT THE GUEST'S ───────────────────────────
 * What the guest said with their reply is `guest.response_note`, and it is
 * shown on the Overview tab under its own heading. Two authors, two lifetimes;
 * putting them in one list would lose which of the two a sentence came from.
 *
 * ── ⚠ REMINDERS DO NOT NOTIFY ANYBODY ───────────────────────────────────────
 * There is no job runner and no SMTP. This is a list the host reads. The card
 * says so, because a bell icon with no bell behind it is a promise nothing
 * keeps — and somebody would rely on it.
 *
 * ── "UPCOMING" IS DERIVED, NOT STORED ───────────────────────────────────────
 * `state` comes from the server on every read, computed from `due_at` versus
 * now. This file never decides it: a second implementation of the same rule is
 * one that can disagree with the first.
 */
export function NotesTab({ guestId, data, fmt }: {
    guestId: number; data: GuestProfile; fmt: Fmt;
}) {
    const [editing, setEditing] = useState<GuestNote | null>(null);
    const [composing, setComposing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<GuestNote | null>(null);

    const [tagLabel, setTagLabel] = useState('');
    const [reminderOpen, setReminderOpen] = useState(false);

    const removeNote = useDeleteNote();
    const addTag = useAddTag();
    const removeTag = useRemoveTag();
    const updateNote = useUpdateNote();
    const updateReminder = useUpdateReminder();
    const removeReminder = useDeleteReminder();

    const pinned = data.notes.filter((n) => n.is_pinned);
    const rest = data.notes.filter((n) => !n.is_pinned);

    function submitTag() {
        const label = tagLabel.trim();
        if (!label) return;
        addTag.mutate({ id: guestId, label }, { onSuccess: () => setTagLabel('') });
    }

    return (
        <>
            <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                {/* ── Notes ───────────────────────────────────────────────── */}
                <Card className="py-0">
                    <CardContent className="flex min-w-0 flex-col gap-3 p-4">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <SectionHeading icon={StickyNote} label={`Notes (${data.notes.length})`} />
                            <Button size="sm" onClick={() => { setEditing(null); setComposing(true); }}>
                                <Plus className="size-3.5" /> Add note
                            </Button>
                        </div>

                        {data.notes.length === 0 ? (
                            <Empty text="No notes yet. Anything you record here is for you — the guest never sees it." />
                        ) : (
                            <div className="flex min-w-0 flex-col gap-3">
                                {/* Pinned first, matching the server's order. */}
                                {pinned.map((n) => (
                                    <NoteCard
                                        key={n.id} note={n} fmt={fmt}
                                        onEdit={() => { setEditing(n); setComposing(true); }}
                                        onDelete={() => setConfirmDelete(n)}
                                        onTogglePin={() => updateNote.mutate({
                                            id: guestId, noteId: n.id, is_pinned: !n.is_pinned,
                                        })}
                                    />
                                ))}
                                {pinned.length && rest.length ? <Separator /> : null}
                                {rest.map((n) => (
                                    <NoteCard
                                        key={n.id} note={n} fmt={fmt}
                                        onEdit={() => { setEditing(n); setComposing(true); }}
                                        onDelete={() => setConfirmDelete(n)}
                                        onTogglePin={() => updateNote.mutate({
                                            id: guestId, noteId: n.id, is_pinned: !n.is_pinned,
                                        })}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex min-w-0 flex-col gap-3.5">
                    {/* ── Tags ────────────────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-3 p-4">
                            <SectionHeading icon={TagIcon} label="Tags" />
                            {data.tags.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {data.tags.map((t) => (
                                        <span
                                            key={t.id}
                                            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${
                                                t.tint ? TINT_STYLE[t.tint] : 'bg-muted text-muted-foreground'
                                            }`}
                                        >
                                            <span className="break-words">{t.label}</span>
                                            <button
                                                type="button"
                                                aria-label={`Remove ${t.label}`}
                                                onClick={() => removeTag.mutate({ id: guestId, tagId: t.id })}
                                                className="opacity-60 hover:opacity-100"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11.5px] text-muted-foreground">No tags yet.</p>
                            )}
                            <div className="flex items-center gap-2">
                                <Input
                                    value={tagLabel}
                                    onChange={(e) => setTagLabel(e.target.value.slice(0, 60))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTag(); } }}
                                    placeholder="Add a tag…"
                                    className="h-9 text-[12px]"
                                />
                                <Button
                                    size="icon" variant="outline" className="size-9 shrink-0"
                                    onClick={submitTag}
                                    disabled={!tagLabel.trim() || addTag.isPending}
                                    aria-label="Add tag"
                                >
                                    {addTag.isPending
                                        ? <Loader2 className="size-3.5 animate-spin" />
                                        : <Plus className="size-3.5" />}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── Reminders ───────────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-3 p-4">
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <SectionHeading icon={Bell} label="Reminders" />
                                <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
                                    <Plus className="size-3.5" /> Add
                                </Button>
                            </div>

                            {data.reminders.length === 0 ? (
                                <p className="text-[11.5px] text-muted-foreground">Nothing to be reminded of.</p>
                            ) : (
                                <div className="flex min-w-0 flex-col gap-2">
                                    {data.reminders.map((r) => (
                                        <div key={r.id} className="flex min-w-0 items-start gap-2 rounded-lg border p-2.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[12px] font-medium break-words">{r.title}</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Due {fmt(r.due_at, true)}
                                                </p>
                                                <Badge variant="ghost" className={`mt-1 ${REMINDER_STYLE[r.state]}`}>
                                                    {REMINDER_LABEL[r.state]}
                                                </Badge>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    size="icon" variant="ghost" className="size-7"
                                                    title={r.status === 'done' ? 'Reopen' : 'Mark done'}
                                                    onClick={() => updateReminder.mutate({
                                                        id: guestId, reminderId: r.id,
                                                        status: r.status === 'done' ? 'pending' : 'done',
                                                    })}
                                                >
                                                    {r.status === 'done'
                                                        ? <BellOff className="size-3.5" />
                                                        : <Check className="size-3.5" />}
                                                </Button>
                                                <Button
                                                    size="icon" variant="ghost"
                                                    className="size-7 text-destructive"
                                                    title="Delete"
                                                    onClick={() => removeReminder.mutate({ id: guestId, reminderId: r.id })}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/*
                              ⚠ Said plainly. A bell icon with no bell behind it
                              is a promise nothing keeps, and somebody would
                              rely on it.
                            */}
                            <p className="text-[11px] break-words text-muted-foreground">
                                Reminders are a list for you to read. Nothing is sent — there is no
                                email or notification behind them yet.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <NoteDialog
                key={editing ? `edit-${editing.id}` : 'new'}
                open={composing}
                onOpenChange={setComposing}
                guestId={guestId}
                note={editing}
            />

            <ReminderDialog
                key={reminderOpen ? 'reminder-open' : 'reminder-closed'}
                open={reminderOpen}
                onOpenChange={setReminderOpen}
                guestId={guestId}
            />

            <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Delete this note?</DialogTitle>
                        <DialogDescription className="break-words">
                            {/* Names the note, so nobody deletes the wrong one from a list. */}
                            &ldquo;{confirmDelete?.title}&rdquo; will be removed from this guest.
                            Nothing else about them changes.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={removeNote.isPending}
                            onClick={() => {
                                if (!confirmDelete) return;
                                removeNote.mutate(
                                    { id: guestId, noteId: confirmDelete.id },
                                    { onSuccess: () => setConfirmDelete(null) },
                                );
                            }}
                        >
                            {removeNote.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Delete note
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/* ── One note ────────────────────────────────────────────────────────────── */

function NoteCard({ note, fmt, onEdit, onDelete, onTogglePin }: {
    note: GuestNote; fmt: Fmt;
    onEdit: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3.5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {note.is_pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
                        <span className="text-[13px] font-semibold break-words">{note.title}</span>
                        <Badge variant="ghost" className={`text-[10px] ${CATEGORY_STYLE[note.category]}`}>
                            {note.category}
                        </Badge>
                    </div>
                </div>
                {/*
                  ⚠ Always visible, never opacity-0 + group-hover. An invisible
                  button that still takes clicks blocks whatever is beneath it.
                */}
                <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" className="size-7" onClick={onTogglePin}
                        title={note.is_pinned ? 'Unpin' : 'Pin'}>
                        {note.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={onEdit} title="Edit">
                        <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive"
                        onClick={onDelete} title="Delete">
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>

            {/*
              ⚠ HTML from the rich editor. Splitting it as plain text would
              render the tags to the reader — same rule as every other Quill
              field in this codebase.
            */}
            {note.body && !htmlIsEmpty(note.body) ? (
                <div
                    className="prose-sm min-w-0 text-[12.5px] break-words [&_a]:text-primary [&_p]:my-0.5"
                    dangerouslySetInnerHTML={{ __html: note.body }}
                />
            ) : null}

            <p className="text-[11px] text-muted-foreground">
                {note.author ? `${note.author} · ` : ''}{fmt(note.created_at, true)}
                {note.edited ? ' · edited' : ''}
            </p>
        </div>
    );
}

/* ── Add / edit a note ───────────────────────────────────────────────────── */

/**
 * ⚠ State is seeded from PROPS in the `useState` initialisers, and the parent
 * gives this a `key` — so it is populated once per open and never re-seeded
 * over what somebody has typed. No effect, for the same reasons as the RSVP
 * edit form.
 */
function NoteDialog({ open, onOpenChange, guestId, note }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    guestId: number;
    note: GuestNote | null;
}) {
    const [title, setTitle] = useState(note?.title ?? '');
    const [body, setBody] = useState(note?.body ?? '');
    const [category, setCategory] = useState<NoteCategory>(note?.category ?? 'general');
    const [pinned, setPinned] = useState(note?.is_pinned ?? false);
    const [error, setError] = useState(false);

    const close = () => onOpenChange(false);
    const create = useCreateNote(close);
    const update = useUpdateNote(close);
    const busy = create.isPending || update.isPending;

    function submit() {
        if (busy) return;
        if (!title.trim()) { setError(true); return; }
        setError(false);
        const payload = { title: title.trim(), body, category, is_pinned: pinned };
        if (note) update.mutate({ id: guestId, noteId: note.id, ...payload });
        else create.mutate({ id: guestId, ...payload });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{note ? 'Edit note' : 'Add a note'}</DialogTitle>
                    <DialogDescription>
                        Your own note about this guest. They never see it.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="note-title" className="text-[12px]">
                            Title <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="note-title"
                            value={title}
                            onChange={(e) => { setTitle(e.target.value.slice(0, 150)); setError(false); }}
                            placeholder="Vegetarian preference"
                            aria-invalid={error}
                        />
                        {error ? (
                            <span className="text-[11px] text-destructive">A note needs a title.</span>
                        ) : null}
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label className="text-[12px]">Note</Label>
                        <RichTextEditor value={body} onChange={setBody} />
                    </div>

                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label className="text-[12px]">Category</Label>
                            <Select value={category} onValueChange={(v) => setCategory(v as NoteCategory)}>
                                <SelectTrigger className="w-full text-[12.5px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {NOTE_CATEGORIES.map((c) => (
                                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label className="text-[12px]">Pin</Label>
                            <Button
                                type="button"
                                variant={pinned ? 'default' : 'outline'}
                                onClick={() => setPinned((p) => !p)}
                                className="justify-start"
                            >
                                <Pin className="size-3.5" /> {pinned ? 'Pinned to the top' : 'Not pinned'}
                            </Button>
                        </div>
                    </div>

                    {/*
                      Where the design puts a Visibility select with "Internal /
                      Shared". Nothing shows a guest their own notes — there is
                      no guest-facing view at all — so a control offering it
                      would promise something that cannot happen.
                    */}
                    <p className="text-[11px] break-words text-muted-foreground">
                        Every note is private to you. There is no guest-facing view to share one with.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
                    <Button onClick={submit} disabled={busy}>
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {note ? 'Save note' : 'Add note'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── Add a reminder ──────────────────────────────────────────────────────── */

function ReminderDialog({ open, onOpenChange, guestId }: {
    open: boolean; onOpenChange: (v: boolean) => void; guestId: number;
}) {
    const [title, setTitle] = useState('');
    const [due, setDue] = useState('');
    const [errors, setErrors] = useState<{ title?: boolean; due?: boolean }>({});

    const close = () => onOpenChange(false);
    const create = useCreateReminder(close);

    function submit() {
        if (create.isPending) return;
        const bad: typeof errors = {};
        if (!title.trim()) bad.title = true;
        if (!due) bad.due = true;
        /*
          Refused in the past HERE too, matching the server. A date the API
          will reject should not be submittable — the server is still the one
          that decides, this just avoids a pointless round trip.
        */
        if (due && new Date(due).getTime() < Date.now()) bad.due = true;
        if (Object.keys(bad).length) { setErrors(bad); return; }
        setErrors({});
        create.mutate({ id: guestId, title: title.trim(), due_at: new Date(due).toISOString() });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Add a reminder</DialogTitle>
                    <DialogDescription>
                        A note to yourself with a date. Nothing is sent to anybody.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="rem-title" className="text-[12px]">
                            What <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="rem-title"
                            value={title}
                            onChange={(e) => { setTitle(e.target.value.slice(0, 150)); setErrors({}); }}
                            placeholder="Follow up if no response"
                            aria-invalid={!!errors.title}
                        />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="rem-due" className="text-[12px]">
                            When <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="rem-due"
                            type="datetime-local"
                            value={due}
                            onChange={(e) => { setDue(e.target.value); setErrors({}); }}
                            aria-invalid={!!errors.due}
                        />
                        {errors.due ? (
                            <span className="text-[11px] text-destructive">
                                Pick a date and time in the future.
                            </span>
                        ) : null}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={close} disabled={create.isPending}>Cancel</Button>
                    <Button onClick={submit} disabled={create.isPending}>
                        {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Add reminder
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
