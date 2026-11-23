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
  metadataBase: new URL("https://fluidpour.shopluckybears.com"),
  alternates: { canonical: "/" },
  title: "Fluid Pour Studio: Acrylic Pour Painting App | Lucky Bear",
  description:
    "Free acrylic pour painting on your phone or computer. Flip cup, Dutch pour, ring pour and cells, with tilt and spin. No mess, no ads, no account. Also on Google Play.",
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  openGraph: {
    title: "Fluid Pour Studio: Lucky Bear",
    description: "Pour, tilt and spin real-feeling acrylic paint on your phone. Free, no ads, no account.",
    type: "website",
    url: "https://fluidpour.shopluckybears.com/",
    images: ["https://fluidpour.shopluckybears.com/og-v2.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://fluidpour.shopluckybears.com/og-v2.jpg"],
  },
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
