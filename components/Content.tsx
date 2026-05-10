import { cn } from "@/lib/shared/utils";

interface ContentProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
}

export function Content({ as: Comp = "div", className, children, ...props }: ContentProps) {
    return (
        <div className="relative max-w-2xl mx-auto px-9 sm:px-12 py-20">
            {/* Edge blur fade — all four sides via layered linear-gradient masks */}
            <div
                className="pointer-events-none absolute -inset-12 -z-1 bg-background/50 h-screen"
                style={{
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    maskImage: "linear-gradient(to right, transparent, black 10%, black 80%, transparent), linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
                    WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 80%, transparent), linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
                    maskComposite: "intersect",
                    WebkitMaskComposite: "source-in",
                }}
                aria-hidden
            />
            <Comp className={className} {...props}>
                {children}
            </Comp>
        </div>
    );
}
