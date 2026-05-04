import type { Metadata } from "next";
import { Instrument_Serif, Lexend, Inter } from "next/font/google";
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

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
    title: "Your Name",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={cn(instrumentSerif.variable, "font-sans", inter.variable)} suppressHydrationWarning>
            <body className="font-sans antialiased">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <TooltipProvider>
                        {children}
                        <ChatWidget />
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
