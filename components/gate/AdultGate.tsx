"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { verifyAge } from "@/components/gate/actions";
import { Divider } from "../ui/divider";
import { Content } from "../Content";
import { Body } from "../Body";

interface AdultGateProps {
    destination: string;
}

export default function AdultGate({ destination }: AdultGateProps) {
    const [verifying, setVerifying] = useState(false);

    const handleVerify = async () => {
        setVerifying(true);
        await verifyAge(destination);
    };

    return (
        <Body className="flex min-h-[75vh] flex-col items-center justify-center rounded-lg border border-border bg-muted/30 p-10 text-center">
            <Content className="max-w-md w-full space-y-10 text-center py-0">
                <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-border bg-muted text-3xl select-none">
                    🔞
                </div>

                {/* Heading */}
                <div className="space-y-3">
                    <h1 className="font-serif text-4xl font-normal tracking-tight text-foreground">
                        Adults only
                    </h1>
                    <p className="text-base leading-relaxed text-muted-foreground">
                        I don't host sexual content, but <b>you must be 18+ to enter.</b>{' '}
                        This page may discuss adult topics and/or have features unsuitable for children.
                    </p>
                </div>

                {/* Divider */}
                <Divider />

                {/* Actions */}
                <div className="mt-8 flex flex-col gap-3">
                    <Button
                        onClick={handleVerify}
                        disabled={verifying}
                        size="lg"
                        className="w-full"
                    >
                        {verifying ? "Verifying..." : "I am 18 or older"}
                    </Button>
                </div>

                {/* Fine print */}
                <p className="mt-5 text-sm text-muted-foreground/60">
                    By continuing you confirm that you are of legal age in your
                    jurisdiction and consent to viewing adult content.
                </p>
            </Content>
        </Body>
    );
}
