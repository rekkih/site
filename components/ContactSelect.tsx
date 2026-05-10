import fs from "fs"
import path from "path"
import { ContactSelectClient } from "@/components/ContactSelectClient"

interface ContactOption {
    href: string
    label: string
}

export async function ContactSelect() {
    let options: ContactOption[] = []
    try {
        const filePath = path.join(process.cwd(), "socials.json")
        const raw = fs.readFileSync(filePath, "utf-8")
        options = JSON.parse(raw)
    } catch {
        // socials.json missing or malformed — render nothing
    }

    if (!options || options.length === 0) return null

    return <ContactSelectClient options={options} />
}
