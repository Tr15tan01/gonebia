import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";
import { PaddleBridge } from "@/components/paddle-bridge";
import { NetworkStatus } from "@/components/network-status";
import { AuthSessionProvider } from "@/components/auth-session-provider";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `(function(){try{var t=localStorage.getItem('gonebia-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
const accentInit = `(function(){try{var a=localStorage.getItem('gonebia-accent');var map={amber:'#b45309',emerald:'#059669',teal:'#0d9488',sky:'#0284c7',indigo:'#4f46e5',violet:'#7c3aed',rose:'#e11d48',slate:'#475569'};var hex=map[a];if(hex){document.documentElement.style.setProperty('--ember',hex);document.documentElement.style.setProperty('--ember-soft','color-mix(in srgb, '+hex+' 12%, transparent)');}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${inter.variable}`}>
      <head>
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
