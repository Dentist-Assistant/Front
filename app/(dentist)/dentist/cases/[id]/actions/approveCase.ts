// app/(…)/actions/approveCase.ts
"use client";

import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type CaseRow = { id: string; status: string };

const FINAL_STATUS = "SIGNED";

export async function approveCase(caseId: string) {
  if (!caseId) return { ok: false, error: "Missing caseId" };

  const supabase = getSupabaseBrowser();

  const { data: sessRes, error: sessErr } = await supabase.auth.getSession();
  const session = sessRes?.session ?? null;
  if (sessErr || !session?.user) return { ok: false, error: "Unauthorized" };

  const { data: current, error: curErr } = await supabase
    .from("cases")
    .select("id,status")
    .eq("id", caseId)
    .maybeSingle()
    .returns<CaseRow>();

  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "Not found" };

  if (current.status === FINAL_STATUS) {
    return { ok: true, data: current };
  }

  const { data, error } = await (supabase as any)
    .from("cases")
    .update({ status: FINAL_STATUS })
    .eq("id", caseId)
    .select("id,status")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: data as CaseRow };
}
