const https = require("https");

function fetchIp(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 6000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ip);
        } catch {
          resolve(data.trim());
        }
      });
    }).on("error", (e) => resolve("Error: " + e.message));
  });
}

async function getIps() {
  const [ipv4, ipv6OrAny] = await Promise.all([
    fetchIp("https://api4.ipify.org?format=json"),
    fetchIp("https://api64.ipify.org?format=json"),
  ]);
  console.log("PUBLIC_IPV4=" + ipv4);
  console.log("PUBLIC_IPV6_OR_GLOBAL=" + ipv6OrAny);
}

getIps();

