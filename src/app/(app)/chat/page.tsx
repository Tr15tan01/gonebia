import { Suspense } from "react";
import { ChatClient } from "@/components/chat";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <Suspense>
      <ChatClient />
    </Suspense>
  );
}
