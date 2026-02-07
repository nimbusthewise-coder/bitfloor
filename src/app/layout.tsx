import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bitfloor",
  description: "A pixel-art digital office where humans and AI agents coexist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
