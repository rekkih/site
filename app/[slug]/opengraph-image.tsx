import { ImageResponse } from "next/og";
import { getEntry } from "@/lib/server/entries";
import { loadGoogleFont } from "@/lib/server/load-google-font";

export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const entry = getEntry(slug);

    if (!entry) return null;

    const instrumentSerif = await loadGoogleFont("Instrument Serif");
    const snPro = await loadGoogleFont("SN Pro");

    const date = new Date(entry.date);
    const formatted = date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });

    return new ImageResponse(
        (
            <div
                style={{
                    background: "white",
                    width: "100%",
                    height: "100%",
                    padding: "80px 120px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                }}
            >
                <div style={{ fontSize: 72, fontFamily: "Instrument Serif", fontWeight: 700 }}>
                    {entry?.title ?? slug}
                </div>
                <div style={{ fontSize: 32, color: "#999", fontFamily: "SN Pro" }}>
                    {formatted}
                </div>
                <div style={{ fontSize: 32, color: "#999", fontFamily: "SN Pro" }}>
                    - rekki
                </div>
            </div>
        ),
        {
            ...size,
            fonts: [
                {
                    name: "Instrument Serif",
                    data: instrumentSerif,
                    style: "normal",
                    weight: 700,
                },
                {
                    name: "SN Pro",
                    data: snPro,
                    style: "normal",
                    weight: 400,
                },
            ],
        }
    );
}
