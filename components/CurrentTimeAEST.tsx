"use client";

import getAESTTime from "@/lib/get-aest-time";
import { useState, useEffect } from "react";

function ClockIcon({ time }: { time: string }) {
    const [hourStr, minuteStr] = time.split(":");
    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);

    // Degrees clockwise from 12 o'clock
    const minuteDeg = (minutes / 60) * 360;
    const hourDeg = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;

    const toCoords = (deg: number, length: number) => {
        const rad = (deg * Math.PI) / 180;
        return {
            x: 12 + length * Math.sin(rad),
            y: 12 - length * Math.cos(rad),
        };
    };

    const minuteTip = toCoords(minuteDeg, 4);
    const hourTip = toCoords(hourDeg, 2.8);

    const d = `M${minuteTip.x.toFixed(2)} ${minuteTip.y.toFixed(2)}L12 12L${hourTip.x.toFixed(2)} ${hourTip.y.toFixed(2)}`;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            color="currentColor"
            className="size-3"
        >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path
                d={d}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
            />
        </svg>
    );
}

export default function CurrentTimeAEST({ initialTime }: { initialTime: string }) {
    const [time, setTime] = useState(initialTime);

    useEffect(() => {
        setTime(getAESTTime());
        const interval = setInterval(() => setTime(getAESTTime()), 60_000);
        return () => clearInterval(interval);
    }, []);

    return (
        <span className="inline-flex items-center gap-1">
            <ClockIcon time={time} /> {time} where I am.
        </span>
    );
}
