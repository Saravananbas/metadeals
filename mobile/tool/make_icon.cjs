// Draws the app icon (the website's shopping-bag mark) as PNGs. Run from the mobile folder: node tool/make_icon.cjs
const sharp = require("../../node_modules/sharp");
const fs = require("fs");
fs.mkdirSync("assets", { recursive: true });

const bag = (stroke) => `
  <g fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
  </g>`;
const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ff9a3d"/><stop offset="0.45" stop-color="#f97316"/><stop offset="0.8" stop-color="#5b21d6"/></linearGradient></defs>`;

// Full icon (iOS and old Android): gradient square, bag centred.
const full = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${gradient}
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g transform="translate(192 192) scale(26.67)">${bag("#ffffff")}</g></svg>`;
// Android adaptive icon foreground: transparent, bag inside the central safe zone.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(262 262) scale(20)">${bag("#ffffff")}</g></svg>`;

(async () => {
  await sharp(Buffer.from(full)).png().toFile("assets/icon.png");
  await sharp(Buffer.from(foreground)).png().toFile("assets/icon_foreground.png");
  console.log("icons written");
})();
