"use client";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Eraser, ImageIcon, Italic, IndentDecrease, IndentIncrease, Link2, List, ListOrdered, Redo2, Smile, Strikethrough, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import styles from "../composer.module.css";

const EMOJI = ["😀", "😁", "😂", "😊", "😍", "🤩", "😎", "🤔", "😅", "🙏", "👍", "👎", "👏", "🙌", "💪", "🔥", "💯", "🎉", "❤️", "✨", "⭐", "🛍️", "🛒", "💸", "🏷️", "🎁", "📦", "✅", "❌", "⚠️"];

type Props = {
  id: string;
  /** HTML to load. Change `version` to load it again (for example when a draft is restored). */
  initialHtml: string;
  version: number;
  placeholder: string;
  limit: number;
  onChange: (html: string, textLength: number) => void;
  onPickImage?: () => void;
  minHeight?: number;
};

/** Rich text editor (TipTap). The browser only ever produces TipTap's own schema; the server sanitizes the HTML again before saving. */
export function RichEditor({ id, initialHtml, version, placeholder, limit, onChange, onPickImage, minHeight = 180 }: Props) {
  const [len, setLen] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false), [emojiOpen, setEmojiOpen] = useState(false), [url, setUrl] = useState(""), [linkError, setLinkError] = useState("");
  const loaded = useRef(-1);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false, autolink: false, HTMLAttributes: { rel: "nofollow ugc noopener noreferrer", target: "_blank" } } }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml,
    editorProps: { attributes: { id, class: styles.prose, "aria-label": placeholder, role: "textbox", "aria-multiline": "true", style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor: e }) => { const text = e.getText().trim().length; setLen(text); onChange(e.isEmpty ? "" : e.getHTML(), text); },
  });

  useEffect(() => {
    if (!editor || loaded.current === version) return;
    loaded.current = version;
    editor.commands.setContent(initialHtml || "", { emitUpdate: false });
    const text = editor.getText().trim().length;
    setLen(text);
    // The page needs the real length too (for validation), not only the editor.
    onChange(editor.isEmpty ? "" : editor.getHTML(), text);
    // After a quote or a restored draft the cursor goes to the end, so typing continues below it.
    if (version > 0) editor.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, version, initialHtml]);

  if (!editor) return <div className={styles.editorBox} style={{ minHeight: minHeight + 52 }} aria-busy />;
  const btn = (label: string, active: boolean, run: () => void, icon: React.ReactNode, disabled = false) => (
    <button type="button" className={`${styles.tb} ${active ? styles.tbOn : ""}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>{icon}</button>
  );
  const heading = editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p";

  function applyLink() {
    let href = url.trim();
    if (!/^https?:\/\//i.test(href)) href = "https://" + href;
    try { const parsed = new URL(href); if (parsed.protocol !== "https:") throw new Error("https"); href = parsed.toString(); } catch { setLinkError("Enter a full https link."); return; }
    editor!.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false); setUrl(""); setLinkError("");
  }

  return (
    <div className={styles.editorBox}>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <select className={styles.blockSelect} aria-label="Text style" value={heading} onChange={(e) => { const v = e.target.value; const c = editor.chain().focus(); if (v === "p") c.setParagraph().run(); else c.toggleHeading({ level: v === "h2" ? 2 : 3 }).run(); }}>
          <option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option>
        </select>
        <span className={styles.sep} />
        {btn("Bold", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold size={18} />)}
        {btn("Italic", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic size={18} />)}
        {btn("Underline", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={18} />)}
        {btn("Strikethrough", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={18} />)}
        <span className={styles.sep} />
        {btn("Bulleted list", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List size={18} />)}
        {btn("Numbered list", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={18} />)}
        {btn("Indent", false, () => editor.chain().focus().sinkListItem("listItem").run(), <IndentIncrease size={18} />, !editor.can().sinkListItem("listItem"))}
        {btn("Outdent", false, () => editor.chain().focus().liftListItem("listItem").run(), <IndentDecrease size={18} />, !editor.can().liftListItem("listItem"))}
        <span className={styles.sep} />
        {btn("Insert link", editor.isActive("link"), () => { setEmojiOpen(false); setLinkOpen((v) => !v); }, <Link2 size={18} />)}
        {onPickImage && btn("Add picture", false, onPickImage, <ImageIcon size={18} />)}
        {btn("Emoji", false, () => { setLinkOpen(false); setEmojiOpen((v) => !v); }, <Smile size={18} />)}
        <span className={styles.sep} />
        {btn("Clear formatting", false, () => editor.chain().focus().unsetAllMarks().clearNodes().run(), <Eraser size={18} />)}
        {btn("Undo", false, () => editor.chain().focus().undo().run(), <Undo2 size={18} />, !editor.can().undo())}
        {btn("Redo", false, () => editor.chain().focus().redo().run(), <Redo2 size={18} />, !editor.can().redo())}
      </div>
      {linkOpen && (
        <div className={styles.popover}>
          <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setLinkError(""); }} placeholder="https://www.store.com/product" aria-label="Link address" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} autoFocus />
          <button type="button" className={styles.miniBtn} onClick={applyLink}>Add link</button>
          {editor.isActive("link") && <button type="button" className={styles.miniBtn} onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Remove</button>}
          {linkError && <span className={styles.fieldError} role="alert">{linkError}</span>}
        </div>
      )}
      {emojiOpen && (
        <div className={styles.popover} role="listbox" aria-label="Emoji">
          {EMOJI.map((e) => <button key={e} type="button" className={styles.emoji} onMouseDown={(ev) => ev.preventDefault()} onClick={() => { editor.chain().focus().insertContent(e).run(); setEmojiOpen(false); }}>{e}</button>)}
        </div>
      )}
      <EditorContent editor={editor} />
      <div className={`${styles.counter} ${len > limit ? styles.counterOver : ""}`} aria-live="polite">{len.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")}</div>
    </div>
  );
}
