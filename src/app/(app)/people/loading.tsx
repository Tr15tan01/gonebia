import { ListLoader } from "@/components/page-loader";

export default function Loading() {
  return ListLoader({ title: "People", sub: "Loading everyone in your memory" });
}
