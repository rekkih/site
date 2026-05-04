"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "age_verified";
// 1 year in seconds
const MAX_AGE = 60 * 60 * 24 * 365;

export async function verifyAge(destination: string) {
    const jar = await cookies();
    jar.set(COOKIE_NAME, "true", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE,
        // Automatically secure in production
        secure: process.env.NODE_ENV === "production",
    });

    // Only allow relative paths to prevent open-redirect attacks
    const safe = destination.startsWith("/") ? destination : "/";
    redirect(safe);
}
