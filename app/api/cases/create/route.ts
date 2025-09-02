// app/api/cases/create/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "../../../../lib/supabaseServer";
import type { Database } from "../../../../types/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  patientId: z.string().uuid().optional(),
  assignedTech: z.string().uuid().nullable().optional(),
  imagePaths: z.array(z.string().min(1)).max(50).optional(),
});

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];

type CaseImageInsertLoose = {
  case_id: string;
  storage_path: string;
  is_original?: boolean | null;
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const supabase = createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = {
      title: input.title ?? "New case",
      status: "DRAFT",
      created_by: user.id,
      notes: input.description ?? null,
      patient_id: input.patientId ?? null,
      assigned_tech: input.assignedTech ?? null,
    };

    const { data: createdRaw, error: insertErr } = await (supabase as any)
      .from("cases")
      .insert(row as any)
      .select()
      .single();

    if (insertErr || !createdRaw) {
      return NextResponse.json(
        { error: "Failed to create case", detail: insertErr?.message ?? null },
        { status: 400 }
      );
    }

    const created = createdRaw as CaseRow;

    if (input.imagePaths && input.imagePaths.length > 0) {
      const caseId = String((created as any).id);
      const imgRows: CaseImageInsertLoose[] = input.imagePaths.map((p) => ({
        case_id: caseId,
        storage_path: p,
        is_original: true,
      }));

      const { error: imgErr } = await (supabase as any)
        .from("case_images")
        .insert(imgRows as any);

      if (imgErr) {
        return NextResponse.json(
          {
            error: "Case created but failed to attach images",
            case: {
              id: (created as any).id,
              title: created.title,
              status: created.status,
              created_at: created.created_at,
            },
            detail: imgErr.message,
          },
          { status: 207, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    return NextResponse.json(
      {
        id: (created as any).id,
        title: created.title,
        status: created.status,
        created_at: created.created_at,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
