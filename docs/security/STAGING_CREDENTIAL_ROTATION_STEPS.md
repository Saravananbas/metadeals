# Rotating the staging database password and the cron secret (hPanel steps)

For `staging.metadeals4u.in` only. Do not touch the production WordPress site or its database (`u113628361_DEB3O`). **Never paste a password or secret into chat, a commit or a document.** Menu names in hPanel can differ slightly; the intent of each step is stated.

## Before you start
- Pick a quiet moment: the staging site will fail to reach its database between steps 2 and 4 (a few minutes).
- Generate two new values in your password manager: a database password (24+ characters; letters and digits only avoids URL-encoding problems) and a cron secret (40+ characters, letters and digits).

## A. Staging database password
1. hPanel > **Websites** > `staging.metadeals4u.in` > **Manage**.
2. **Databases** > **Management**. Find the database `u113628361_staging` (user `u113628361_admin`). Do **not** open the other database (`u113628361_DEB3O`).
3. Choose **Change password** (or edit the user), enter the new database password, save.
4. Update the app's environment variable so the site can still connect: hPanel > the same website > **Node.js** (advanced) > **Environment variables** > edit `DATABASE_URL`, keep the host `127.0.0.1`, port `3306` and database name `u113628361_staging`, and put the new password in. (If the password contains special characters they must be URL-encoded.) Save.
5. **Redeploy or restart** the Node.js app so it reads the new variable. Check `https://staging.metadeals4u.in/api/health/ready` shows the database as up.

## B. Cron secret (`ANALYTICS_CRON_SECRET`)
1. Same **Environment variables** screen: edit `ANALYTICS_CRON_SECRET` to the new cron secret. Save.
2. hPanel > **Advanced** > **Cron Jobs**: open the nightly analytics rollup job for staging and replace the secret in its `x-cron-secret` header (or URL option) with the new value. Save.
3. Restart the app again if hPanel says the variables need it.

## C. Update the copies on your PC (this is what is still missing)
1. Open `D:\Metadeals\staging\env` and replace the password inside the `DATABASE_URL` line (keep the user, host and database name). Save.
2. Open `D:\Metadeals\staging\analytics-cron-secret.txt`, replace the first line with the new cron secret. Save.
3. These folders are git-ignored. Keep them out of shared drives and screenshots.

## D. Check, then tell me
- Tell me "credentials updated and saved locally". I will test the connection with a read-only query and report only success or failure (no values).
- If you changed the database password but the old Remote MySQL rule for your PC was removed, I need that rule again (hPanel > Databases > Remote MySQL: add this PC's public IP for `u113628361_staging`); remove it again after the migrations.

## If something goes wrong
- Site shows a database error: the `DATABASE_URL` password does not match the database password. Re-enter the same new value in both places and restart.
- Cron job returns 401: the job header does not match `ANALYTICS_CRON_SECRET`.
- The previous values are not kept anywhere; use your password manager's history if you saved them.
