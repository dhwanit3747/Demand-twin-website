import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemandTwin AI — Demand intelligence",
  description: "See demand clearly. Plan inventory confidently.",
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
