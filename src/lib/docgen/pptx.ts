import PptxGenJS from "pptxgenjs";

export interface SlideSpec {
  title: string;
  bullets?: string[];
  notes?: string;
}

const COLORS = {
  background: "FAF9F5",
  foreground: "292824",
  muted: "77746A",
  accent: "BD5D3A",
  white: "FFFFFF",
};

/** Structured slides → professionally styled 16:9 .pptx */
export async function buildPptx(params: {
  title: string;
  subtitle?: string;
  slides: SlideSpec[];
  author?: string;
}): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9"; // 10 x 5.625 inches
  pptx.author = params.author ?? (process.env.NEXT_PUBLIC_APP_NAME || "PO-GPT");
  pptx.title = params.title;

  // ── Title slide ──
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: COLORS.background };
  titleSlide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.18,
    h: 5.625,
    fill: { color: COLORS.accent },
  });
  titleSlide.addText(params.title, {
    x: 0.7,
    y: 1.9,
    w: 8.6,
    h: 1.4,
    fontSize: 40,
    bold: true,
    color: COLORS.foreground,
    fontFace: "Georgia",
  });
  if (params.subtitle) {
    titleSlide.addText(params.subtitle, {
      x: 0.7,
      y: 3.3,
      w: 8.6,
      h: 0.7,
      fontSize: 18,
      color: COLORS.muted,
    });
  }
  titleSlide.addText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), {
    x: 0.7,
    y: 5.0,
    w: 5,
    h: 0.4,
    fontSize: 12,
    color: COLORS.muted,
  });

  // ── Content slides ──
  for (const [index, spec] of params.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };

    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 10,
      h: 0.06,
      fill: { color: COLORS.accent },
    });
    slide.addText(spec.title, {
      x: 0.55,
      y: 0.35,
      w: 8.9,
      h: 0.8,
      fontSize: 26,
      bold: true,
      color: COLORS.foreground,
      fontFace: "Georgia",
    });

    const bullets = (spec.bullets ?? []).filter((b) => b.trim() !== "");
    if (bullets.length > 0) {
      const fontSize = bullets.length > 8 ? 13 : bullets.length > 5 ? 15 : 17;
      slide.addText(
        bullets.map((raw) => {
          // Two leading spaces (or "- " prefix) → sub-bullet
          const indentLevel = /^(\s{2,}|-\s)/.test(raw) ? 1 : 0;
          const text = raw.replace(/^(\s+|-\s+)/, "").replace(/\*\*/g, "");
          return {
            text,
            options: {
              bullet: { characterCode: "2022", indent: 14 } as const,
              indentLevel,
              fontSize: indentLevel > 0 ? fontSize - 2 : fontSize,
              color: indentLevel > 0 ? COLORS.muted : COLORS.foreground,
              paraSpaceAfter: 8,
            },
          };
        }),
        { x: 0.6, y: 1.35, w: 8.8, h: 3.9, valign: "top" }
      );
    }

    slide.addText(`${index + 1}`, {
      x: 9.3,
      y: 5.2,
      w: 0.5,
      h: 0.3,
      fontSize: 10,
      color: COLORS.muted,
      align: "right",
    });

    if (spec.notes) slide.addNotes(spec.notes);
  }

  const data = await pptx.write({ outputType: "nodebuffer" });
  return data as Buffer;
}
