let fontCss: Promise<string> | null = null;
/** Inline the Inter web font (latin subset) as data URLs so the snapshot keeps the app's typeface. */
function interFontCss() {
  fontCss ??= (async () => {
    try {
      const css = await (await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap", { signal: AbortSignal.timeout(6000) })).text();
      const blocks = css.split("/* ").filter((b) => b.startsWith("latin */"));
      const out: string[] = [];
      for (const b of blocks) {
        const url = b.match(/url\((https:[^)]+)\)/)?.[1];
        if (!url) continue;
        const buf = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        out.push(b.slice(b.indexOf("@font-face")).replace(url, `data:font/woff2;base64,${btoa(bin)}`));
      }
      return out.join("\n");
    } catch {
      return "";
    }
  })();
  return fontCss;
}

/** Render a DOM node to a multi-page A4 PDF (browser only). */
export async function exportElementToPdf(el: HTMLElement, filename: string) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const width = el.scrollWidth;
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    ...(await interFontCss().then((css) => (css ? { fontEmbedCSS: css } : { skipFonts: true }))),
    backgroundColor: bg,
    width,
    style: { margin: "0" },
    filter: (n) => !(n instanceof HTMLElement && n.dataset["pdfHide"] !== undefined),
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pw - margin * 2;
  const usableH = ph - margin * 2;
  const scale = usableW / img.width; // pt per image px
  const sliceH = Math.floor(usableH / scale); // image px per page

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  // jsPDF only understands sRGB; resolve the (oklch) page colour through the canvas.
  canvas.width = canvas.height = 1;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1, 1);
  const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)) as [number, number, number];
  canvas.width = img.width;
  for (let y = 0, page = 0; y < img.height; y += sliceH, page++) {
    const h = Math.min(sliceH, img.height - y);
    canvas.height = h;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, h);
    ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
    if (page > 0) pdf.addPage();
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.rect(0, 0, pw, ph, "F");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, usableW, h * scale);
  }
  pdf.save(filename);
}
