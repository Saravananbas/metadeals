import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const postgresPassword = randomBytes(24).toString("hex");
const redisPassword = randomBytes(24).toString("hex");
const contents = template
  .replaceAll("REPLACE_LOCAL_PASSWORD", postgresPassword)
  .replaceAll("REPLACE_LOCAL_REDIS_PASSWORD", redisPassword)
  .replaceAll("REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS", randomBytes(32).toString("hex"));
try {
  await writeFile(new URL("../.env", import.meta.url), contents, { flag: "wx", mode: 0o600 });
  console.log("Created .env with random local-only secrets. No external credentials were created.");
} catch (error) {
  if (error.code === "EEXIST") {
    console.log(".env already exists; left unchanged.");
  } else {
    throw error;
  }
}
