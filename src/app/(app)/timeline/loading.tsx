import { ListLoader } from "@/components/page-loader";

export default function Loading() {
  return ListLoader({ title: "Timeline", sub: "Loading your memories, newest first" });
}
