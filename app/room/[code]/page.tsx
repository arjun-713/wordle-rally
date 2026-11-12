import { notFound } from "next/navigation";
import RoomClient from "@/components/room";
import { resolveInvite } from "@/lib/service";
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: param } = await params;
  const upper = param.toUpperCase();
  let code = upper;
  if (!/^[A-Z2-9]{6}$/.test(upper)) {
    const resolved = await resolveInvite(param);
    if (!resolved) notFound();
    code = resolved;
  }
  return <RoomClient code={code} />;
}