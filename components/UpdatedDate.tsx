import { execSync } from "child_process";

function getLastCommitDate(): string {
    try {
        const iso = execSync("git log -1 --format=%cI", { encoding: "utf-8" }).trim();
        const d = new Date(iso);
        const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    } catch {
        return "recently";
    }
}

export default function UpdatedDate() {
    const formatted = getLastCommitDate();
    return <time>{formatted}</time>;
}
