import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";
import { AuthProvider } from "@/components/AuthProvider";
import { ProfileProvider } from "@/components/ProfileProvider";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bric",
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-source",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FINN — Financial Investment Agent",
  description: "What moved. Why it matters. Mobile-first for the public markets desk.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#E8EEF5",
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
          </ProfileProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
