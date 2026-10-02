"use client";

/* Reading a document's text — in the browser, on purpose.
 *
 * The file never leaves the student's machine to be parsed. It goes to their
 * own private bucket, and the text extraction happens right here, in the tab
 * they uploaded from. That is not a performance decision: a CV is one of the
 * most personal files a student owns, and the only defensible place to read it
 * is a machine they are already holding. It also means there is no parsing
 * service to secure, scale, or explain.
 *
 * OCR is deliberately absent. You ruled it out and that was the right call: a
 * PDF's text layer is cheap and exact, OCR is expensive and guesses. A scan
 * with no text layer is reported as a scan rather than run through a guesser
 * whose mistakes would then be shown to the student as findings.
 */

import { textFromItems, type ParseStatus } from "@rof/core";

export type ReadResult = {
  status: ParseStatus;
  text: string;
  pages: number | null;
  /* Why, in the student's words, when there is nothing to read. */
  note: string | null;
};

/** What the picker accepts. Parsed and stored, versus stored and said so. */
export const READABLE = [".pdf", ".txt", ".md"] as const;
export const STORABLE = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".doc", ".docx", ".rtf", ".odt"] as const;
export const ACCEPT = [...READABLE, ...STORABLE].join(",");

export const MAX_BYTES = 10 * 1024 * 1024;

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export function isReadable(name: string): boolean {
  return (READABLE as readonly string[]).includes(extensionOf(name));
}

/* A stable fingerprint, so re-uploading the same file replaces it instead of
 * collecting duplicates. SHA-256 via SubtleCrypto — available in every browser
 * that can run this app, and over https only, which is where it will run. */
export async function hashFile(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    /* Insecure context or a blocked API: duplicates simply stay possible. */
    return null;
  }
}

/**
 * Pull the text out of a document, or say why there is none.
 *
 * Never throws: a reader that crashes on a malformed PDF would take the upload
 * down with it, and the upload is the part that matters. A failure here means
 * the file is stored and unread, which is a legitimate end state.
 */
export async function readDocument(file: File, onProgress?: (pct: number) => void): Promise<ReadResult> {
  const ext = extensionOf(file.name);

  if (ext === ".txt" || ext === ".md") {
    try {
      const text = await file.text();
      return text.trim()
        ? { status: "parsed", text, pages: null, note: null }
        : { status: "no_text", text: "", pages: null, note: "The file is empty." };
    } catch {
      return { status: "failed", text: "", pages: null, note: "The file could not be read." };
    }
  }

  if (ext !== ".pdf") {
    return {
      status: "stored",
      text: "",
      pages: null,
      note: "Stored, not read — we only read PDFs and text files.",
    };
  }

  try {
    /* Imported here rather than at module scope: pdf.js is large, and a
     * student who never opens the Dossier should never download it. */
    const pdfjs = await import("pdfjs-dist");
    /* The worker ships from our own origin. A CDN would be blocked by the
     * CSP, and correctly so. */
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false, useSystemFonts: true }).promise;

    const parts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      /* Lines are rebuilt from each item's hasEOL rather than joined with
       * spaces — see textFromItems. Flattening the page destroys the section
       * headers the extractor relies on, and makes every quoted sentence the
       * wrong one. */
      parts.push(textFromItems(content.items as { str?: string; hasEOL?: boolean }[]));
      onProgress?.(Math.round((p / doc.numPages) * 100));
    }
    const pages = doc.numPages;
    await doc.destroy();

    const text = parts.join("\n").trim();
    if (!text) {
      /* The overwhelmingly common cause, and worth naming precisely: a photo
       * or a scan has no text layer. Saying "no text found" would read as a
       * bug in us rather than a property of the file. */
      return {
        status: "no_text",
        text: "",
        pages,
        note: "Stored. There is no text layer in this PDF — it looks like a scan or a photo.",
      };
    }
    return { status: "parsed", text, pages, note: null };
  } catch {
    return {
      status: "failed",
      text: "",
      pages: null,
      note: "Stored. This PDF could not be opened for reading.",
    };
  }
}
