export default function getAESTTime(): string {
    return new Date().toLocaleTimeString("en-AU", {
        timeZone: "Australia/Sydney",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}
