# Upload flow

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

Patterns for uploading files — single attachment, multi-file with progress, drag-drop zones, and post-upload preview.

**Note: this reference is a starting draft.**

> Anchored loosely on the simple file picker in Talenta reimbursement. If you have a more complete upload pattern from Mekari (multi-file progress, S3 direct upload, drag-drop with preview, replace-on-reupload), enrich this file accordingly. Treat the rules below as the minimum bar.

## When to use which variant

| Context                                                  | Variant                         |
| -------------------------------------------------------- | ------------------------------- |
| Single optional file (receipt, ID photo, supporting doc) | Simple file picker              |
| Single required file with preview before submit          | File picker + inline preview    |
| Multiple files, mixed types, batch upload                | Drop zone + file list           |
| Large files or async processing (videos, PDFs > 20MB)    | Drop zone + queue with progress |

## Variant A: Simple file picker

Used in the Talenta reimbursement form.

```
Attachment
┌────────────────────────────────────────────┐
│ [Choose file]   No file chosen yet         │
└────────────────────────────────────────────┘
File must be in JPG, JPEG, PNG, and PDF with a
maximum of 10 MB.
```

### Anatomy

- Container: 40px height, border `border.default` 1px, radius `pxl-radii-md` 6.
- Inside, left to right:
  - **"Choose file" button**: outline style, height ~28–32px, padding `pxl-space-xs` 8 horizontal, `Label small/Regular` Semibold, text `text.link`, border `border.default`. Margin `pxl-space-2xs` 6 from container edge.
  - **Status text**: `Label/Regular`, `text.secondary`. Shows "No file chosen yet" before selection, filename after.
- Helper text below: **always** specify allowed formats and max size. Format: "File must be in [formats] with a maximum of [size]."

### States

- **Empty (initial)**: "No file chosen yet".
- **Selected (not yet uploaded)**: filename. Add a small `×` icon at the far right to clear selection.
- **Uploading**: linear progress bar inside the container, status text "Uploading… 45%".
- **Uploaded**: filename + small green check icon, optional file size shown after filename: `receipt.pdf · 2.3 MB`.
- **Error**: filename in `background.danger.bold`, status icon (alert-circle) right-aligned, helper text replaced with error: "Upload failed. File exceeds 10 MB."

### Required field

- Asterisk in label as usual.
- Validate on submit, not on selection.

## Variant B: File picker + inline preview

Same picker, but after upload show a preview thumbnail below.

- Image files: thumbnail 96×96px, `pxl-radii-md` 6, border `border.default` 1px. Click to lightbox.
- PDF/document: file-type icon (PDF, DOCX, XLSX) in a 96×96 placeholder + filename below in `Label small/Regular`.
- Replace action: small text link "Replace" below the thumbnail, opens picker again.
- Remove action: `×` button top-right of thumbnail.

## Variant C: Drop zone + file list

For multiple files.

```
┌────────────────────────────────────────────────────┐
│                                                    │
│         [icon]                                     │
│         Drag and drop files here                   │
│         or browse from your computer               │
│         [Browse files]                             │
│                                                    │
└────────────────────────────────────────────────────┘
File must be in JPG, JPEG, PNG, and PDF.
Maximum 10 files, 10 MB each.

Uploaded files:
┌────────────────────────────────────────────────────┐
│ [icon] receipt-jan-2026.pdf · 2.3 MB     [×]      │
├────────────────────────────────────────────────────┤
│ [icon] receipt-feb-2026.pdf · 1.8 MB     [×]      │
├────────────────────────────────────────────────────┤
│ [icon] receipt-mar.jpg     · uploading 67%   [×]  │
└────────────────────────────────────────────────────┘
```

### Drop zone anatomy

> Call `get-component("dropzone")` for code example

- Dashed border: 1px dashed `border.default`, radius `pxl-radii-md` 6.
- Background: `background.surface` (very subtle).
- Padding: `pxl-space-3xl` 40 vertical, `pxl-space-xl` 24 horizontal.
- Content: icon (cloud-upload or similar) `icon.default`, then title `Label/Semibold` "Drag and drop files here", then helper `Label small/Regular (color: `text.secondary`)` "or browse from your computer", then outline button "Browse files".
- Drag-over state: border solid `border.selected`, background `background.brand.selected` lightened.

### File list anatomy

> Call `get-component("upload list") for code example

- Each row: `background.stage` (white), border `border.default` 1px (or just bottom border if part of a card).
- Row content: file-type icon + filename + size or status + remove button.
- Progress: replace size text with `Label small/Regular (color: `text.secondary`)` "uploading XX%" + a thin progress bar at the bottom of the row.
- Failed file: filename in `background.danger.bold`, status "Failed — Retry" with the word "Retry" as a text link.

## Constraints to always specify

Every upload field, regardless of variant, must declare in helper text:

1. **Allowed file formats** (extensions, not MIME types — users don't know MIME types).
2. **Max size per file**.
3. **Max number of files** (if multi-file).
4. Optionally: **what the file is used for** if it's not obvious from the label.

Bad: "Upload files".
Good: "File must be in JPG, JPEG, PNG, and PDF with a maximum of 10 MB."

## Validation behavior

- Validate **on the client first** — reject oversize or wrong-format files before upload starts. Show inline error: "This file is too large. Maximum 10 MB."
- Server-side validation as backup. Error copy comes from server but rendered in the same inline error slot.
- If a file fails mid-upload (network), keep it in the list with a "Retry" action — don't silently drop it.

## Edge Cases

- **Duplicate filenames**: if user uploads `receipt.pdf` twice, dedupe by appending `(1)` or reject? Default: allow, append suffix.
- **Concurrent upload limit**: how many files upload in parallel? Default: 3.
- **Cancel during upload**: clicking `×` on an in-progress upload cancels it cleanly (abort the request, free the slot).
- **Partial submission**: if the form is submitted while one file is still uploading, what happens? Default: block submit, show banner "Wait for uploads to finish."
- **Page navigation during upload**: warn the user before they leave.
- **File previews on slow connections**: don't block the form until preview thumbnails load — show placeholder while loading.

## Output Contract

When you ship an upload field/zone:

- Variant chosen with reasoning.
- Allowed formats, max size per file, max file count.
- Validation strategy (client vs server messages).
- Cancel and retry behavior.
- Concurrent upload limit.
- What happens to in-flight uploads when form is submitted or page is navigated.
