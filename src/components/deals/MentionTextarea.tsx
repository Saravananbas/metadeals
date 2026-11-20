"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import styles from "./DealComments.module.css";

type Suggestion = { handle: string; hasAvatar: boolean };
type Props = { id: string; value: string; onChange: (value: string) => void; maxLength: number; rows?: number; placeholder?: string; required?: boolean };

/** A comment box that suggests user names after "@". Keep typing and nothing changes if the name is not found. */
export function MentionTextarea({ id, value, onChange, maxLength, rows = 3, placeholder, required }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState<{ q: string; start: number } | null>(null);

  useEffect(() => {
    if (!query?.q) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/community/mentions?q=${encodeURIComponent(query.q)}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => { setItems(b?.data?.items ?? []); setActive(0); })
        .catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  // Suggestions only count while an @name is being typed.
  const shown = query?.q ? items : [];

  function onInput(e: ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    onChange(text);
    const before = text.slice(0, e.target.selectionStart);
    const match = /(^|\s)@([a-z0-9_]{0,30})$/i.exec(before);
    setQuery(match ? { q: match[2], start: before.length - match[2].length - 1 } : null);
  }

  function pick(s: Suggestion) {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${s.handle} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null); setItems([]);
    const pos = query.start + s.handle.length + 2;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shown.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % shown.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a + shown.length - 1) % shown.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape") { setQuery(null); setItems([]); }
  }

  return (
    <div className={styles.mentionWrap}>
      <textarea ref={ref} id={id} value={value} onChange={onInput} onKeyDown={onKey} onBlur={() => setTimeout(() => setItems([]), 120)} maxLength={maxLength} rows={rows} required={required} placeholder={placeholder}
        role="combobox" aria-expanded={shown.length > 0} aria-controls={`${id}-mentions`} aria-autocomplete="list" />
      {shown.length > 0 && (
        <ul className={styles.mentionList} id={`${id}-mentions`} role="listbox" aria-label="Members">
          {shown.map((s, i) => (
            <li key={s.handle} role="option" aria-selected={i === active} className={i === active ? styles.mentionActive : undefined} onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
              {s.hasAvatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/v1/avatars/${s.handle}`} alt="" width={24} height={24} />
                : <span aria-hidden="true">{s.handle.slice(0, 1).toUpperCase()}</span>}
              @{s.handle}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
