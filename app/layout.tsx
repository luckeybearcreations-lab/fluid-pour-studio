import type { Metadata } from "next";
import "@/index.css";

export const metadata: Metadata = {
  title: "Lucky Bear Fluid Studio",
  description:
    "A mobile-first fluid art studio for pouring, tilting, mixing colors, saving recipes, and exporting finished art.",
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
