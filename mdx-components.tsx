import type { MDXComponents } from "mdx/types";
import { HoverMaps } from "@/components/HoverMaps";
import { HoverPackbaseProfile } from "@/components/HoverPackbaseProfile";
import { HoverLink } from "@/components/HoverLink";

export function useMDXComponents(components: MDXComponents): MDXComponents {
    return {
        HoverMaps,
        HoverPackbaseProfile,
        HoverLink,
        a: (props) => <HoverLink href={props.href ?? ""} {...props} />,
        ...components,
    };
}
