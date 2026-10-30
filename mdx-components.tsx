import type {MDXComponents} from 'mdx/types'
import {HoverMaps} from '@/components/HoverMaps'
import {HoverPackbaseProfile} from '@/components/HoverPackbaseProfile'
import {HoverLink} from '@/components/HoverLink'
import {EmailPopup} from '@/components/EmailPopup'
import {ContactSelect} from '@/components/ContactSelect'
import {Divider} from '@/components/ui/divider'
import {EntriesList} from '@/components/EntriesList'

export function useMDXComponents(components: MDXComponents): MDXComponents {
    return {
        HoverMaps,
        Link: (props) => {
            if (props.href === 'emaildialog') return <EmailPopup {...props}>{props.children}</EmailPopup>
            // href has https://packbase.app/u/ ?
            if (props.href.startsWith('https://packbase.app/u/')) return <HoverPackbaseProfile
                username={props.href.split('/u/').pop()} {...props} />
            return <HoverLink {...props} />
        },
        EmailPopup,
        ContactSelect,
        EntriesList,
        a: (props) => {
            if (props.href === 'emaildialog') return <EmailPopup {...props}>{props.children}</EmailPopup>
            return <HoverLink href={props.href ?? ''} {...props} />
        },
        hr: (props) => <Divider {...props} />,
        ...components,
    }
}
