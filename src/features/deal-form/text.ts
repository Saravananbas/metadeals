/** Plain text to editor HTML (paragraphs): used when details are fetched or an old plain description is opened in the editor. */
export const textToHtml = (text: string) => text.split(/\n{2,}|\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("");

/** Editor HTML to plain text (what cards, search and the length limit use). The server derives it again; this is only for the form. */
export const htmlToPlain = (html: string) => new DOMParser().parseFromString(html.replace(/<\/(p|h2|h3|blockquote)>/gi, "\n\n").replace(/<\/li>|<br\s*\/?>/gi, "\n"), "text/html").documentElement.textContent?.replace(/\n{3,}/g, "\n\n").trim() ?? "";
