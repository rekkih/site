import type { Metadata } from "next";
import { Instrument_Serif, SN_Pro } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/shared/utils";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import Heartbeat from "@/components/Heartbeat";

const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
    variable: "--font-serif",
});

const SNPro = SN_Pro({
    subsets: ["latin"],
    variable: "--font-sans",
    adjustFontFallback: true,
    fallback: ["Nunito", "ui-sans-serif", "system-ui", "sans-serif"],
})

export const metadata: Metadata = {
    title: {
        default: "Rekki Harley",
        template: "%s | Rekki Harley",
    },
    description: "UI/UX designer and TypeScript developer based in Melbourne, AU. Founder of Wild HQ and Packbase.",
    keywords: ["UI/UX", "design", "TypeScript", "React", "Melbourne", "Wild HQ", "Packbase"],
    authors: [{ name: "Rekki Harley" }],
    creator: "Rekki Harley",
    metadataBase: new URL("https://rek.lol"),
    alternates: {
        canonical: "/",
    },
    openGraph: {
        type: "website",
        locale: "en_AU",
        url: "https://rek.lol",
        title: "Rekki Harley",
        description: "UI/UX designer and TypeScript developer based in Melbourne, AU.",
        siteName: "Rekki Harley",
    },
    twitter: {
        card: "summary_large_image",
        creator: "@rekki",
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
};

const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Rekki Harley",
    url: "https://rek.lol",
    sameAs: ["https://packbase.app/@rek"],
    jobTitle: "UI/UX Designer & Developer",
    worksFor: {
        "@type": "Organization",
        name: "Wild HQ",
    },
    address: {
        "@type": "PostalAddress",
        addressLocality: "Melbourne",
        addressCountry: "AU",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={cn(instrumentSerif.variable, SNPro.variable)} suppressHydrationWarning>
            <head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />
            </head>
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
                        <Heartbeat />
                        {children}
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
