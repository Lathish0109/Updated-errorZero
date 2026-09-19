"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isSafeImageUrl } from "@/lib/bug-constants";
import { addAttachment, createBug, setBugImageFromFile, type BugLabel } from "@/services/bugs";
import type { Tables } from "@/types/database";

export async function createBugFormAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const title = (formData.get("title") as string)?.trim();
  const projectId = formData.get("project") as string;
  const source = formData.get("source") as Tables<"bugs">["source"];
  const severity = formData.get("severity") as Tables<"bugs">["severity"];
  const priority = formData.get("priority") as Tables<"bugs">["priority"];
  const assigneeValue = formData.get("assignee") as string;
  const steps = (formData.get("steps") as string)?.trim();
  const expected = (formData.get("expected") as string)?.trim() || null;
  const actual = (formData.get("actual") as string)?.trim() || null;
  const context = (formData.get("context") as string)?.trim() || null;
  const labels = formData.getAll("labels") as BugLabel[];
  const files = formData.getAll("attachments") as File[];
  const imageUrl = (formData.get("imageUrl") as string)?.trim() || null;
  const imageFile = formData.get("image") as File | null;

  if (!title || !projectId || !severity || !steps) {
    return { error: "Title, project, severity, and steps to reproduce are required." };
  }
  if (imageUrl && !isSafeImageUrl(imageUrl)) {
    return { error: "Image URL must be a valid http:// or https:// link." };
  }

  const { error, bugId } = await createBug({
    title,
    project_id: projectId,
    source,
    severity,
    priority,
    assignee_id: assigneeValue && assigneeValue !== "unassigned" ? assigneeValue : null,
    steps_to_reproduce: steps,
    expected_result: expected,
    actual_result: actual,
    additional_context: context,
    image_url: imageUrl,
    labels,
  });

  if (error || !bugId) {
    return { error: error ?? "Couldn't create bug." };
  }

  if (imageFile && imageFile.size > 0) {
    await setBugImageFromFile(bugId, imageFile);
  }

  for (const file of files) {
    if (file.size > 0) {
      await addAttachment(bugId, file);
    }
  }

  revalidatePath("/bugs");
  redirect(`/bugs/${bugId}`);
}
