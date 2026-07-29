import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  const bg = [11, 93, 59]; // #0b5d3b
  const fg = [255, 255, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const inCircle = (x - size / 2) ** 2 + (y - size / 2) ** 2 <= (size * 0.38) ** 2;
      const [r, g, b] = inCircle ? fg : bg;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", makeIcon(192));
writeFileSync("public/icons/icon-512.png", makeIcon(512));
console.log("Ikoner genereret i public/icons/");
