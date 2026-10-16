import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import MobileTabBar from "@/components/MobileTabBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "aidPAL — Community Good, Organized",
  description:
    "A social network that turns community goodwill into organized action.",
};

// viewportFit: "cover" emits viewport-fit=cover so env(safe-area-inset-*)
// resolves on notched devices; progressive enhancement everywhere else.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavBar />
        {/* pb-20 on mobile reserves space for the fixed bottom tab bar so the
            last item is never covered; no padding at >=992px (bar hidden). */}
        <main className="w-full flex-1 pb-20 min-[992px]:pb-0">
          {children}
        </main>
        <MobileTabBar />
      </body>
    </html>
  );
}
