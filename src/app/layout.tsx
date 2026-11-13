import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";
import { AuthProvider } from "@/components/AuthProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { PwaRegister } from "@/components/PwaRegister";
import { InstallPrompt } from "@/components/InstallPrompt";

const display = localFont({
  src: "../../public/fonts/BricolageGrotesque-Variable.ttf",
  variable: "--font-bric",
  display: "swap",
  weight: "500 800",
});

const sans = localFont({
  src: "../../public/fonts/SourceSans3-Variable.ttf",
  variable: "--font-source",
  display: "swap",
  weight: "400 700",
});

export const metadata: Metadata = {
  applicationName: "FINN",
  title: {
    default: "FINN — Financial Investment Agent",
    template: "%s · FINN",
  },
  description: "What moved. Why it matters. Mobile-first AI investment copilot.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FINN",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E8EEF5" },
    { media: "(prefers-color-scheme: dark)", color: "#E8EEF5" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body
        style={
          {
            "--font-display": "var(--font-bric), sans-serif",
            "--font-sans": "var(--font-source), sans-serif",
            "--font-mono": "var(--font-source), sans-serif",
          } as React.CSSProperties
        }
      >
        <AuthProvider>
          <ProfileProvider>
            <AppFrame>{children}</AppFrame>
            <InstallPrompt />
          </ProfileProvider>
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
