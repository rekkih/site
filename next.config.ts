import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { LINK_HOSTNAMES } from "./lib/shared/link-whitelist";

const withMDX = createMDX({
    options: {
        remarkPlugins: ["remark-frontmatter"],
    },
});

const nextConfig: NextConfig = {
    compiler: {
      removeConsole: process.env.NODE_ENV === 'production',
    },
    experimental: {
        inlineCss: true,
    },
    pageExtensions: ["ts", "tsx", "mdx"],
    allowedDevOrigins: ['192.168.4.103'],
    images: {
        remotePatterns: LINK_HOSTNAMES.map((hostname) => ({
            protocol: "https" as const,
            hostname,
        })),
    }
};

export default withMDX(nextConfig);
