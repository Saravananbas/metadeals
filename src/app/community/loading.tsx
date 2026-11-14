import styles from "@/features/community/community.module.css";

/** Shown while a community page (feed, filter, search, discussion) loads: grey placeholders in the same three-column layout, so nothing jumps. */
export default function Loading() {
  const bar = (w: string, h = 14) => <div className={styles.skel} style={{ width: w, height: h }} />;
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading">
      <header className={styles.topbar}><div className={styles.topbarInner}><div className={styles.skel} style={{ width: 180, height: 34, opacity: .35 }} /></div></header>
      <main className={styles.shell}>
        <div className={styles.grid3}>
          <div className={styles.leftDesktop}><div className={styles.card} style={{ display: "grid", gap: 12 }}>{[1, 2, 3, 4, 5, 6].map((i) => <div key={i}>{bar("80%")}</div>)}</div></div>
          <section className={styles.center}>
            <div className={styles.card} style={{ display: "grid", gap: 10 }}>{bar("45%", 22)}{bar("70%")}</div>
            <div className={styles.card}>{bar("100%", 40)}</div>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.card} style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}><div className={styles.skel} style={{ width: 28, height: 28, borderRadius: "50%" }} />{bar("30%")}</div>
                {bar("60%", 20)}{bar("90%")}{bar("40%")}
              </div>
            ))}
          </section>
          <aside className={styles.right}>{[1, 2, 3].map((i) => <div key={i} className={styles.card} style={{ display: "grid", gap: 10 }}>{bar("50%", 18)}{bar("90%")}{bar("70%")}</div>)}</aside>
        </div>
      </main>
    </div>
  );
}
