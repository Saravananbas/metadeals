const https = require("https");
const dns = require("dns");

function fetchFrom(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data.trim()));
    }).on("error", (e) => resolve("Error: " + e.message));
  });
}

async function check() {
  const ip4 = await fetchFrom("https://ipv4.icanhazip.com");
  console.log("IPv4:", ip4);
  const ip6 = await fetchFrom("https://ipv6.icanhazip.com");
  console.log("IPv6:", ip6);
}

check();

