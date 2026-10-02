"use client";

/* The Dossier's storage half: files in the student's own private bucket, rows
 * in a table only they can read.
 *
 * There is no local fallback here, and that is the one place in this app where
 * a feature refuses to work signed out. Saved opportunities degrade gracefully
 * to a browser store because the worst case is a forgotten list. A document
 * cannot: without an identity there is nothing to scope the storage policy to,
 * so "whose file is this" has no answer and the next student to open the same
 * browser would be able to read it. The gate is the feature working correctly.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { DocKind, Extraction, ParseStatus } from "@rof/core";

export const BUCKET = "student-documents";

export type DossierDoc = {
  id: number;
  kind: DocKind;
  label: string | null;
  fileName: string;
  filePath: string;
  byteSize: number | null;
  mimeType: string | null;
  parseStatus: ParseStatus;
  pageCount: number | null;
  extracted: Extraction | null;
  applied: { terms: string[]; level: string | null; at: string } | null;
  uploadedAt: string;
};

type Row = {
  id: number;
  kind: string;
  label: string | null;
  file_name: string;
  file_path: string;
  byte_size: number | null;
  mime_type: string | null;
  parse_status: string | null;
  page_count: number | null;
  extracted: Extraction | null;
  applied: DossierDoc["applied"];
  uploaded_at: string;
};

const toDoc = (r: Partial<Row> & { id: number; file_name: string; file_path: string; uploaded_at: string }): DossierDoc => ({
  id: r.id,
  kind: (r.kind || "other") as DocKind,
  label: r.label ?? null,
  fileName: r.file_name,
  filePath: r.file_path,
  byteSize: r.byte_size ?? null,
  mimeType: r.mime_type ?? null,
  parseStatus: (r.parse_status || "pending") as ParseStatus,
  pageCount: r.page_count ?? null,
  extracted: r.extracted ?? null,
  applied: r.applied ?? null,
  uploadedAt: r.uploaded_at,
});

/* `*`, not a column list, on purpose.
 *
 * PostgREST rejects a select naming a column that does not exist with a 400
 * for the WHOLE request — so before db/016 is applied, naming parse_status
 * here made the Dossier fail to load entirely and report "your documents could
 * not be loaded", which reads as a server fault when the truth is that the
 * table is simply older than the code. With `*` the list always loads, missing
 * columns arrive as undefined, and the page can say something accurate about
 * why uploading is not available yet. */
const SELECT = "*";

export function useDossier() {
  const { user, status } = useAuth();
  const [docs, setDocs] = useState<DossierDoc[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* null = not yet known. The Dossier needs columns db/016 adds; a deployment
   * running the code but not the migration is a real state this app can be in,
   * and guessing is worse than checking. */
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    if (!sb || !user) {
      setReady(true);
      return;
    }
    const { data, error: e } = await sb
      .from("student_documents")
      .select(SELECT)
      .eq("student_id", user.id)
      .order("uploaded_at", { ascending: false });
    if (e) setError("Your documents could not be loaded right now.");
    else {
      setDocs(((data ?? []) as Row[]).map(toDoc));
      setError(null);
    }
    setReady(true);

    /* One cheap probe for the columns the feature writes. A 400 here means the
     * migration has not been applied — which the UI must say plainly, because
     * no amount of retrying will fix it. */
    const probe = await sb.from("student_documents").select("parse_status").limit(1);
    setSchemaReady(!probe.error);
  }, [user]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "signed-in" && user) void load();
    else {
      setDocs([]);
      setReady(true);
    }
  }, [status, user, load]);

  /**
   * Store the file, then record it.
   *
   * In that order on purpose: a row pointing at an object that does not exist
   * is a broken document in the list, while an object with no row is invisible
   * and costs a few kilobytes. If the row fails, the object is removed again so
   * the bucket does not accumulate files nothing references.
   */
  const upload = useCallback(
    async (
      file: File,
      meta: { kind: DocKind; label?: string; hash: string | null },
    ): Promise<{ doc: DossierDoc | null; error: string | null }> => {
      const sb = supabase();
      if (!sb || !user) return { doc: null, error: "You need to be signed in." };
      if (schemaReady === false)
        return { doc: null, error: "The Dossier's database columns are missing — apply db/016_dossier.sql first." };

      /* The storage policy is `(storage.foldername(name))[1] = auth.uid()`, so
       * the owner's id MUST be the first path segment. The timestamp keeps two
       * files of the same name apart. */
      const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
      const path = `${user.id}/${Date.now()}-${safe}`;

      const up = await sb.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) {
        const m = up.error.message.toLowerCase();
        if (m.includes("exceeded") || m.includes("too large"))
          return { doc: null, error: "That file is larger than the 10 MB limit." };
        if (m.includes("mime") || m.includes("type"))
          return { doc: null, error: "That file type is not accepted." };
        return { doc: null, error: "The upload did not complete. Try again." };
      }

      const { data, error: e } = await sb
        .from("student_documents")
        .insert({
          student_id: user.id,
          kind: meta.kind,
          label: meta.label?.trim() || null,
          file_path: path,
          file_name: file.name.slice(-200),
          byte_size: file.size,
          mime_type: file.type || null,
          content_hash: meta.hash,
          parse_status: "pending",
        })
        .select(SELECT)
        .single();

      if (e || !data) {
        /* Nothing references the object now, so do not leave it behind. */
        await sb.storage.from(BUCKET).remove([path]);
        const dupe = (e?.message ?? "").toLowerCase().includes("duplicate");
        return {
          doc: null,
          error: dupe ? "That exact file is already in your Dossier." : "The document could not be saved.",
        };
      }

      const doc = toDoc(data as Row);
      setDocs((cur) => [doc, ...cur]);
      return { doc, error: null };
    },
    [user, schemaReady],
  );

  /** Record what reading the document found. Claims only — never the profile. */
  const saveExtraction = useCallback(
    async (id: number, parseStatus: ParseStatus, extracted: Extraction | null, pageCount: number | null) => {
      const sb = supabase();
      if (!sb || !user) return;
      setDocs((cur) => cur.map((d) => (d.id === id ? { ...d, parseStatus, extracted, pageCount } : d)));
      await sb
        .from("student_documents")
        .update({ parse_status: parseStatus, extracted, page_count: pageCount, parsed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("student_id", user.id);
    },
    [user],
  );

  /** Record what the student actually agreed to. This is the consent record. */
  const saveApplied = useCallback(
    async (id: number, applied: { terms: string[]; level: string | null }) => {
      const sb = supabase();
      if (!sb || !user) return;
      const value = { ...applied, at: new Date().toISOString() };
      setDocs((cur) => cur.map((d) => (d.id === id ? { ...d, applied: value } : d)));
      await sb.from("student_documents").update({ applied: value }).eq("id", id).eq("student_id", user.id);
    },
    [user],
  );

  const rename = useCallback(
    async (id: number, label: string) => {
      const sb = supabase();
      if (!sb || !user) return;
      const value = label.trim() || null;
      setDocs((cur) => cur.map((d) => (d.id === id ? { ...d, label: value } : d)));
      await sb.from("student_documents").update({ label: value }).eq("id", id).eq("student_id", user.id);
    },
    [user],
  );

  const setKind = useCallback(
    async (id: number, kind: DocKind) => {
      const sb = supabase();
      if (!sb || !user) return;
      setDocs((cur) => cur.map((d) => (d.id === id ? { ...d, kind } : d)));
      await sb.from("student_documents").update({ kind }).eq("id", id).eq("student_id", user.id);
    },
    [user],
  );

  /* Object first, then row: a row with no object is a broken entry the student
   * can see, an object with no row is invisible. The reverse of upload, for the
   * same reason. */
  const remove = useCallback(
    async (doc: DossierDoc) => {
      const sb = supabase();
      if (!sb || !user) return;
      setDocs((cur) => cur.filter((d) => d.id !== doc.id));
      await sb.storage.from(BUCKET).remove([doc.filePath]);
      await sb.from("student_documents").delete().eq("id", doc.id).eq("student_id", user.id);
    },
    [user],
  );

  /** A short-lived link, because the bucket is private and must stay that way. */
  const openUrl = useCallback(async (doc: DossierDoc): Promise<string | null> => {
    const sb = supabase();
    if (!sb) return null;
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(doc.filePath, 60);
    return data?.signedUrl ?? null;
  }, []);

  return {
    docs,
    ready,
    error,
    schemaReady,
    upload,
    saveExtraction,
    saveApplied,
    rename,
    setKind,
    remove,
    openUrl,
    reload: load,
  };
}
