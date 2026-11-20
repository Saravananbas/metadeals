"use client";
import { Lock } from "lucide-react";
import { GROUP_TITLES, type BadgeBoard as Board, type BadgeGroup, type BoardCategory } from "./catalog";
import { BADGE_ICONS } from "./icons";
import styles from "./badges.module.css";

const TIER_CLASS = [styles.t1, styles.t2, styles.t3, styles.t4, styles.t5] as const;
const GROUPS: BadgeGroup[] = ["deals", "community", "safety", "membership"];
const number = (n: number) => n.toLocaleString("en-IN");

function Category({ c }: { c: BoardCategory }) {
  const Icon = BADGE_ICONS[c.icon];
  const current = c.level > 0 ? c.tiers[c.level - 1].name : null;
  return (
    <article className={styles.card} aria-label={`${c.title}: ${c.level} of ${c.tiers.length} unlocked`}>
      <header className={styles.head}>
        <span className={`${styles.big} ${c.level ? TIER_CLASS[c.level - 1] : styles.locked}`} aria-hidden="true"><Icon size={30} strokeWidth={1.75} /></span>
        <div className={styles.titles}>
          <h3>{c.title}</h3>
          <p className={styles.level}>{c.level} / {c.tiers.length} unlocked{current ? <> · <b>{current}</b></> : null}</p>
        </div>
      </header>
      <div className={styles.bar} role="progressbar" aria-label={`Progress in ${c.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}><span style={{ width: `${Math.round(c.progress * 100)}%` }} /></div>
      <p className={styles.next}>
        {c.next ? <>Need <b>{number(c.next.remaining)}</b> more to unlock <b>{c.next.name}</b> <span>({number(c.value)} of {number(c.next.need)} {c.counts})</span></> : <>All tiers unlocked. <span>({number(c.value)} {c.counts})</span></>}
      </p>
      <ul className={styles.tiers}>
        {c.tiers.map((t, i) => (
          <li key={t.name} className={t.earned ? styles.earned : styles.todo} aria-label={`${t.name}, ${t.earned ? "unlocked" : `locked, need ${number(t.need)}`}`}>
            <span className={`${styles.small} ${t.earned ? TIER_CLASS[i] : styles.locked}`} aria-hidden="true"><Icon size={22} strokeWidth={1.75} />{!t.earned && <Lock className={styles.lock} size={10} />}</span>
            <b>{t.name}</b>
            <small>{t.earned ? "Unlocked" : `Need ${number(t.need)}`}</small>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** My Badges: one card per category with its five tiers, how far the member is and what comes next. */
export function BadgeBoard({ board }: { board: Board }) {
  return (
    <div className={styles.board}>
      <p className={styles.summary}><b>{board.earned}</b> of {board.total} badges unlocked</p>
      {GROUPS.map((g) => {
        const items = board.categories.filter((c) => c.group === g);
        return items.length ? (
          <section key={g} aria-label={GROUP_TITLES[g]}>
            <h3 className={styles.group}>{GROUP_TITLES[g]}</h3>
            <div className={styles.grid}>{items.map((c) => <Category key={c.key} c={c} />)}</div>
          </section>
        ) : null;
      })}
    </div>
  );
}
