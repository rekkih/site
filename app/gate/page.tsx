import { Button } from "@/components/ui/button";
import { verifyAge } from "./actions";
import { Body } from "@/components/Body";
import { Content } from "@/components/Content";
import { Divider } from "@/components/ui/divider";

interface Props {
    searchParams: Promise<{ from?: string }>;
}

export const metadata = {
    title: "Age Verification",
};

export default async function GatePage({ searchParams }: Props) {
    const { from = "/" } = await searchParams;

    return (
        <Body as="main" className="flex min-h-svh flex-col items-center justify-center bg-background px-6">
            <Content className="max-w-sm w-full space-y-8 text-center">
                {/* Icon */}
                <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-border bg-muted text-3xl select-none">
                    🔞
                </div>

                {/* Heading */}
                <div className="space-y-3">
                    <h1 className="font-serif text-3xl font-normal tracking-tight text-foreground">
                        Adults only
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        I don't host sexual content, but <b>you must be 18+ to enter.</b>{' '}
                        This page may discuss adult topics and/or have features unsuitable for children.
                    </p>
                </div>

                {/* Divider */}
                <Divider />

                {/* Actions */}
                <div className="flex flex-col gap-3">
                    <form
                        action={async () => {
                            "use server";
                            await verifyAge(from);
                        }}
                    >
                        <Button type="submit" size="lg" className="w-full">
                            I am 18 or older
                        </Button>
                    </form>

                    <a href="https://www.google.com">
                        <Button
                            type="button"
                            variant="ghost"
                            size="lg"
                            className="w-full text-muted-foreground"
                        >
                            Leave
                        </Button>
                    </a>
                </div>

                {/* Fine print */}
                <p className="text-xs text-muted-foreground/60">
                    By entering you confirm that you are of legal age in your
                    jurisdiction and consent to viewing adult content.
                </p>
            </Content>
        </Body>
    );
}
