import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({});

const nextConfig: NextConfig = {
    pageExtensions: ["ts", "tsx", "mdx"],
    allowedDevOrigins: ['192.168.4.103'],
};

export default withMDX(nextConfig);
