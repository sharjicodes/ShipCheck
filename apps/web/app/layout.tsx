import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipCheck — Website quality, clearly reported",
  description: "Run a website accessibility scan and get actionable findings."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
