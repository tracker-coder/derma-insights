/** Render a DOM node to a multi-page A4 PDF (browser only). */
export async function exportElementToPdf(el: HTMLElement, filename: string) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const width = el.scrollWidth;
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
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
  canvas.width = img.width;
  for (let y = 0, page = 0; y < img.height; y += sliceH, page++) {
    const h = Math.min(sliceH, img.height - y);
    canvas.height = h;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, h);
    ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
    if (page > 0) pdf.addPage();
    pdf.setFillColor(bg);
    pdf.rect(0, 0, pw, ph, "F");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, usableW, h * scale);
  }
  pdf.save(filename);
}
