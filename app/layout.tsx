import type { Metadata } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/600-italic.css";
import "@/index.css";

export const metadata: Metadata = {
  title: "Lucky Bear Fluid Studio",
  description:
    "A mobile-first fluid art studio for pouring, tilting, mixing colors, saving recipes, and exporting finished art.",
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  openGraph: {
    title: "Lucky Bear Fluid Studio",
    description: "Pour, tilt and spin real-feeling acrylic paint on your phone.",
    type: "website",
    images: ["/og-v2.jpg"],
  },
  twitter: { card: "summary_large_image", images: ["/og-v2.jpg"] },
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
