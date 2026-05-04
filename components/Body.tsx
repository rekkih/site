import { cn } from "@/lib/shared/utils";

interface BodyProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
}

export function Body({ as: Comp = "div", className, children, ...props }: BodyProps) {
    return (
        <Comp id="content" className={cn("min-h-screen", className)} {...props}>
            {children}
        </Comp>
    );
}
