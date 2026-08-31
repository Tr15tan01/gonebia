"use client";
import { useState } from "react";
import { useToast } from "@/components/ui";

export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button
      onClick={async () => {
        setBusy(true);
        const r = await fetch("/api/billing/portal").then((x) => x.json()).catch(() => null);
        setBusy(false);
        if (r?.url) window.open(r.url, "_blank");
        else toast(r?.error ?? "Couldn't open the billing portal.");
      }}
      disabled={busy}
      className="btn-ghost !py-1.5 !text-xs"
    >{busy ? "Opening..." : "Manage billing (cancel, invoices)"}</button>
  );
}
