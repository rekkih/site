import AboutContent from "./about.mdx";
import DynamicDrawingCanvas from "@/components/DynamicDrawingCanvas";
import { Body } from "@/components/Body";
import { Content } from "@/components/Content";
import UpdatedDate from "@/components/UpdatedDate";
import CurrentTimeAEST from "@/components/CurrentTimeAEST";
import getAESTTime from "@/lib/shared/get-aest-time";
import RekkiSignature from "@/components/RekkiSignature";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Rekki Harley",
    description: "UI/UX designer and TypeScript developer based in Melbourne, AU. Founder of Wild HQ and Packbase.",
    openGraph: {
        type: "website",
        locale: "en_AU",
        title: "Rekki Harley",
        description: "UI/UX designer and TypeScript developer based in Melbourne, AU.",
        siteName: "Rekki Harley",
    },
    twitter: {
        card: "summary_large_image",
        creator: "@rekki",
        title: "Rekki Harley",
        description: "UI/UX designer and TypeScript developer based in Melbourne, AU.",
    },
};

export default function Home() {
    return (
        <>
            {/*<DynamicDrawingCanvas />*/}

            <Body>
                {/* main content */}
                <Content as="article" className="text-base animate-stagger">
                    <div className="mb-4 not-prose">
                        <RekkiSignature className="w-24 mb-2" />
                        <p className="text-meta">
                            Updated <UpdatedDate />
                        </p>
                        <p className="text-meta">
                            <CurrentTimeAEST initialTime={getAESTTime()} />
                        </p>
                    </div>

                    {/* about me */}
                    <AboutContent />
                </Content>
            </Body>
        </>
    );
}
