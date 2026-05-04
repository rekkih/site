import { cn } from "@/lib/shared/utils";

interface ContentProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
}

export function Content({ as: Comp = "div", className, children, ...props }: ContentProps) {
    return (
        <Comp className={cn("max-w-xl mx-auto px-7 sm:px-10 py-14", className)} {...props}>
            {children}
        </Comp>
    );
}
