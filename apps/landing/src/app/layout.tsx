import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/analytics";
import "../styles.css";

export const metadata: Metadata = {
  title: "Vivace — every run, a story",
  description:
    "Connect Strava once. Every activity comes back as a vertical film — your route drawing itself, your pace and heart rate as they happened, ready to share.",
  applicationName: "Vivace",
  openGraph: {
    type: "website",
    siteName: "Vivace",
    title: "Vivace — every run, a story",
    description:
      "Your Strava runs, replayed as a vertical film you can watch and share.",
  },
};

export const viewport: Viewport = {
  // The canvas is true black end to end; browser chrome should agree.
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
