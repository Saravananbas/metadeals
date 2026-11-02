import Link from "next/link";
import styles from "../admin.module.css";

export default function PasswordResetPage() {
  return (
    <main className={styles.authPage}>
      <section className={styles.panel}>
        <div className={styles.brand}>MetaDeals<span>4U</span> Admin</div>
        <h1 className={styles.title}>Contact your Super Admin</h1>
        <p className={styles.subtitle}>
          Automated email delivery is not enabled. A Super Admin can issue a short-lived reset link for your verified account
          and deliver it to you through a private channel.
        </p>
        <Link className={styles.link} href="/admin/login">Return to sign in</Link>
      </section>
    </main>
  );
}
