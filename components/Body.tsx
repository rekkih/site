import { cn } from "@/lib/shared/utils";

interface BodyProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
}

export function Body({ as: Comp = "div", className, children, ...props }: BodyProps) {
    // Add role="main" when using div (non-semantic element) for landmark navigation
    const isDiv = Comp === "div";
    return (
        <Comp
            id="content"
            className={cn("min-h-screen", className)}
            role={isDiv ? "main" : undefined}
            {...props}
        >
            {children}
        </Comp>
    );
}
