import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/lib/role-context";
import "./globals.css";

// design-system/MASTER.md §3 / §4 trap #2: font variable classNames go on
// <html>, not <body> — re-check after every `shadcn init`, which is what
// introduces the regression. globals.css references these families by
// LITERAL name ("Instrument Serif" etc, trap #1), so these next/font calls
// exist to load and register the woff2 files under those exact family
// names; the `variable` CSS custom properties they also produce are not
// consumed anywhere on purpose.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Headroom MP — Grid siting for AI data centres",
  description:
    "Where this comes from, what is happening, where a data centre could go — one record, three acts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg font-sans text-ink">
        {/* MASTER.md §6 "Skip link to the findings band." */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-panel focus:px-4 focus:py-2 focus:text-ink focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to findings
        </a>
        <RoleProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
