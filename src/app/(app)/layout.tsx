import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/nav";
import { ToastProvider } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <ToastProvider>
      <AppNav>{children}</AppNav>
    </ToastProvider>
  );
}
