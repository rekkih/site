import type { Metadata } from "next";
import { Instrument_Serif, SN_Pro } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/shared/utils";
import { ThemeProvider } from "@/components/ThemeProvider";
import ChatWidget from "@/components/chat";
import { TooltipProvider } from "@/components/ui/tooltip";

const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
    variable: "--font-serif",
});

const SNPro = SN_Pro({
    subsets: ["latin-ext"],
    variable: "--font-sans",
    adjustFontFallback: false,
    fallback: ["Nunito", "ui-sans-serif", "system-ui", "sans-serif"],
})

export const metadata: Metadata = {
    title: "Rekki Harley",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={cn(instrumentSerif.variable, SNPro.variable)} suppressHydrationWarning>
            <body className="font-sans antialiased">
                <a href="#content" className="skip-link">
                    Skip to main content
                </a>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <TooltipProvider>
                        {children}
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
