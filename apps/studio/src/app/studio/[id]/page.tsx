import { LocalStudioHost } from "~/components/local-studio-host";

export default async function StudioEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LocalStudioHost projectId={id} />;
}
