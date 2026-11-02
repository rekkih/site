import Markdown, {type Components} from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './notice-markdown.module.css'

const components: Components = {
    table: ({children}) => (
        <div className={styles.tableContainer}>
            <table>{children}</table>
        </div>
    ),
}

// Synchronous rendering keeps the initial HTML and hydrated/live updates identical.
// Raw HTML stays escaped and link URLs use react-markdown's safe default transform.
export function NoticeMarkdown({message}: {message: string}) {
    return (
        <div className={styles.content}>
            <Markdown remarkPlugins={[remarkGfm]} components={components}>{message}</Markdown>
        </div>
    )
}
