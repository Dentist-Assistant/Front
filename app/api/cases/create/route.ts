import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "../../../../lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  patientId: z.string().uuid().optional(),
  assignedTech: z.string().uuid().nullable().optional(),
  imagePaths: z.array(z.string().min(1)).max(50).optional(),
});

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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row: Record<string, any> = {
      title: input.title ?? "New case",
      status: "DRAFT",
      created_by: user.id,
      notes: input.description ?? null,
    };
    if (input.patientId) row.patient_id = input.patientId;
    if (typeof input.assignedTech !== "undefined") row.assigned_tech = input.assignedTech;

    const { data: created, error: insertErr } = await supabase
      .from("cases")
      .insert(row)
      .select("id, title, status, created_at")
      .single();

    if (insertErr || !created) {
      return NextResponse.json(
        { error: "Failed to create case", detail: insertErr?.message ?? null },
        { status: 400 }
      );
    }

    if (input.imagePaths && input.imagePaths.length > 0) {
      const imgRows = input.imagePaths.map((p) => ({
        case_id: created.id,
        storage_path: p,
        is_original: true,
      }));
      const { error: imgErr } = await supabase.from("case_images").insert(imgRows);
      if (imgErr) {
        return NextResponse.json(
          { error: "Case created but failed to attach images", case: created, detail: imgErr.message },
          { status: 207, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
