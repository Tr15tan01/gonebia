import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/nav";
import { ToastProvider } from "@/components/ui";
import { ForegroundNotifier } from "@/components/notifications";
import { InstallPrompt } from "@/components/install-prompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <ToastProvider>
      <ForegroundNotifier />
      <InstallPrompt />
      <AppNav>{children}</AppNav>
    </ToastProvider>
  );
}
