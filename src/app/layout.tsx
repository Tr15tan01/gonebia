import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";
import { PaddleBridge } from "@/components/paddle-bridge";
import { NetworkStatus } from "@/components/network-status";
import { AuthSessionProvider } from "@/components/auth-session-provider";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "TimelyMemo - your external memory",
  description: "Remember things at the right time. Remember. Connect. Notice.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "TimelyMemo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// One-time move of device preferences from the pre-rename storage keys.
const keyMigration = `(function(){try{if(localStorage.getItem('timelymemo-migrated'))return;for(var i=localStorage.length-1;i>=0;i--){var k=localStorage.key(i);if(k&&k.indexOf('timelymemo-')===0){var n='timelymemo-'+k.slice(8);if(localStorage.getItem(n)===null)localStorage.setItem(n,localStorage.getItem(k));localStorage.removeItem(k);}}localStorage.setItem('timelymemo-migrated','1')}catch(e){}})()`;
const themeInit = `(function(){try{var t=localStorage.getItem('timelymemo-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
const accentInit = `(function(){try{var a=localStorage.getItem('timelymemo-accent');var map={amber:'#b45309',emerald:'#059669',teal:'#0d9488',sky:'#0284c7',indigo:'#4f46e5',violet:'#7c3aed',rose:'#e11d48',slate:'#475569'};var hex=map[a];if(hex){document.documentElement.style.setProperty('--ember',hex);document.documentElement.style.setProperty('--ember-soft','color-mix(in srgb, '+hex+' 12%, transparent)');}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bricolage.variable} ${figtree.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: keyMigration }} />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: accentInit }} />
      </head>
      <body className="font-sans antialiased">
        <AuthSessionProvider>
          {children}
          <NetworkStatus />
          <SwRegister />
          <PaddleBridge />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
