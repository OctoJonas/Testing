/**
 * PDF generation for Q&A and autonomous test results.
 *
 * Replaces blueprints/export.py's reportlab-based generators. We match the
 * structure of the original (cover/summary/details) and the German labels
 * the existing UI uses — but not the pixel-perfect styling, since reportlab
 * → pdfkit doesn't translate 1:1 and the data is what matters for QA review.
 */
import PDFDocument from "pdfkit";

import type { AutonomousTestResult, QATestResults } from "../types";

const COLORS = {
  primary: "#2563eb",
  primaryDark: "#1e40af",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#d97706",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
};

function pickStatusColor(score: number): string {
  if (score >= 0.8) return COLORS.success;
  if (score >= 0.6) return COLORS.warning;
  return COLORS.danger;
}

async function bufferDoc(doc: typeof PDFDocument.prototype): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function writeKeyValueRow(
  doc: typeof PDFDocument.prototype,
  label: string,
  value: string,
): void {
  doc.fontSize(9).fillColor(COLORS.gray500).font("Helvetica-Bold").text(`${label}  `, { continued: true });
  doc.font("Helvetica").fillColor(COLORS.gray900).text(value);
}

function writeMetric(doc: typeof PDFDocument.prototype, key: string, value: number): void {
  const score100 = Math.round(value * 100);
  const color = pickStatusColor(value);
  doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text(`${key}: `, { continued: true });
  doc.fillColor(color).font("Helvetica").text(`${score100}%`);
}

export async function generateQAPdf(results: QATestResults): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  doc.info.Title = "Q&A Test Results";
  doc.info.Author = "Octonomy AI Testing";

  // --- Cover -----------------------------------------------------------
  doc.fontSize(20).fillColor(COLORS.gray900).font("Helvetica-Bold").text("Q&A Test Results Report");
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor(COLORS.gray500).font("Helvetica").text(
    `Generated ${new Date().toISOString()} · Model ${results.model || "claude-sonnet-4-5"}`,
  );
  doc.moveDown(1);

  doc.fontSize(13).fillColor(COLORS.primary).font("Helvetica-Bold").text("Summary");
  doc.moveDown(0.4);
  const passRate = results.total > 0 ? Math.round((results.satisfactory / results.total) * 100) : 0;
  writeKeyValueRow(doc, "Total Tests:", String(results.total));
  writeKeyValueRow(doc, "Passed:", String(results.satisfactory));
  writeKeyValueRow(doc, "Failed:", String(results.failed ?? results.total - results.satisfactory));
  writeKeyValueRow(doc, "Pass Rate:", `${passRate}%`);
  doc.moveDown(1);

  // --- Per-result detail ----------------------------------------------
  doc.fontSize(13).fillColor(COLORS.primary).font("Helvetica-Bold").text("Detailed Results");
  doc.moveDown(0.4);

  for (const r of results.results ?? []) {
    if (doc.y > 720) doc.addPage();

    const headerColor = r.is_satisfactory ? COLORS.success : COLORS.danger;
    doc
      .fontSize(11)
      .fillColor(headerColor)
      .font("Helvetica-Bold")
      .text(`Q${(r.index ?? 0) + 1}  ·  ${r.is_satisfactory ? "PASS" : "FAIL"}`);
    if (r.conversation_id) {
      doc.fontSize(8).fillColor(COLORS.gray500).font("Helvetica").text(`conv ${r.conversation_id.slice(0, 8)}…`);
    }
    doc.moveDown(0.3);

    doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Frage:");
    doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(r.question || "(empty)");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Erwartete Antwort:");
    doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(r.expected_answer || "(empty)");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Tatsächliche Antwort:");
    doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(r.actual_response || "(empty)");
    doc.moveDown(0.3);

    if (r.metrics) {
      doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Metriken:");
      for (const [k, v] of Object.entries(r.metrics)) {
        if (typeof v === "number") writeMetric(doc, k, v);
      }
      doc.moveDown(0.2);
    }

    if (r.evaluation) {
      doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Bewertung:");
      doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(r.evaluation);
    }
    if (r.reasoning) {
      doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Begründung:");
      doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(r.reasoning);
    }
    doc.moveDown(0.8);
  }

  return bufferDoc(doc);
}

export async function generateAutonomousPdf(result: AutonomousTestResult): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  doc.info.Title = "Autonomous Test Results";

  doc.fontSize(20).fillColor(COLORS.gray900).font("Helvetica-Bold").text("Autonomous Test Results Report");
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor(COLORS.gray500).font("Helvetica").text(
    `Status: ${result.status.toUpperCase()}  ·  Generated ${new Date().toISOString()}`,
  );
  doc.moveDown(1);

  doc.fontSize(13).fillColor(COLORS.primary).font("Helvetica-Bold").text("Summary");
  doc.moveDown(0.4);
  writeKeyValueRow(doc, "Total Turns:", String(result.totalTurns));
  writeKeyValueRow(doc, "Duration:", `${result.duration.toFixed(1)}s`);
  if (result.conversationId) writeKeyValueRow(doc, "Conversation ID:", result.conversationId);
  doc.moveDown(0.5);

  doc.fontSize(11).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Testing Prompt:");
  doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(result.testingPrompt);
  doc.moveDown(0.8);

  if (result.overallEvaluation) {
    const o = result.overallEvaluation;
    doc.fontSize(13).fillColor(COLORS.primary).font("Helvetica-Bold").text("Overall Evaluation");
    doc.moveDown(0.4);
    writeKeyValueRow(doc, "Average Score:", `${Math.round(o.averageScore * 100)}%`);
    writeKeyValueRow(
      doc,
      "Satisfactory Turns:",
      `${o.satisfactoryTurns} / ${o.totalEvaluatedTurns}`,
    );
    if (o.metricsAverages) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor(COLORS.gray700).font("Helvetica-Bold").text("Average Metrics:");
      for (const [k, v] of Object.entries(o.metricsAverages)) {
        if (typeof v === "number") writeMetric(doc, k, v);
      }
    }
    doc.moveDown(0.8);
  }

  doc.addPage();
  doc.fontSize(13).fillColor(COLORS.primary).font("Helvetica-Bold").text("Conversation Transcript");
  doc.moveDown(0.4);

  for (const msg of result.conversation ?? []) {
    if (doc.y > 720) doc.addPage();
    const label = msg.role === "user" ? "Agent" : msg.role === "assistant" ? "Assistant" : "System";
    const color = msg.role === "user" ? COLORS.primary : msg.role === "assistant" ? COLORS.success : COLORS.warning;
    doc.fontSize(10).fillColor(color).font("Helvetica-Bold").text(`${label} (Turn ${msg.turnNumber})`);
    const clean = (msg.content ?? "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "");
    doc.fontSize(10).fillColor(COLORS.gray900).font("Helvetica").text(clean);
    if (msg.evaluation && msg.role === "assistant") {
      const evalScore = Math.round(msg.evaluation.overall_score * 100);
      const evalColor = msg.evaluation.is_satisfactory ? COLORS.success : COLORS.danger;
      doc
        .fontSize(8)
        .fillColor(evalColor)
        .text(`Score: ${evalScore}% — ${msg.evaluation.is_satisfactory ? "PASS" : "FAIL"}`);
    }
    doc.moveDown(0.6);
  }

  return bufferDoc(doc);
}
