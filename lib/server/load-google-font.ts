export async function loadGoogleFont(font: string, weight = 400) {
    const url =
        `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@${weight}`;

    const css = await fetch(url).then((res) => res.text());

    const resource = css.match(
        /src: url\((.+)\) format\('(woff2|woff|opentype|truetype)'\)/
    );

    if (!resource) {
        throw new Error(`Failed to find font URL for ${font}`);
    }

    const response = await fetch(resource[1]);
    if (!response.ok) {
        throw new Error(`Failed to fetch font file for ${font}`);
    }

    return response.arrayBuffer();
}
