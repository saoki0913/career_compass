#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const outputPath =
  process.argv[2] ??
  path.join(repoRoot, "public", "marketing", "videos", "product-demo.mp4");

const segmentPlan = [
  {
    captureTestName: "01-demo-company-register",
    start: 4.0,
    end: 10.0,
  },
  {
    captureTestName: "02-demo-company-import",
    start: 7.2,
    end: 12.4,
  },
  {
    captureTestName: "03-demo-es-create",
    start: 5.8,
    end: 11.0,
  },
  {
    captureTestName: "04-demo-es-review",
    start: 4.2,
    end: 8.8,
  },
];

function collectRecordedSegments() {
  const testResultsDir = path.join(repoRoot, "test-results");
  if (!fs.existsSync(testResultsDir)) {
    throw new Error("test-results/ が存在しません。先に Playwright で録画してください。");
  }

  const entries = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const resolved = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(resolved);
        continue;
      }
      if (entry.name === "video.webm") {
        entries.push(resolved);
      }
    }
  }

  walk(testResultsDir);

  return segmentPlan.map((segment) => {
    const match = entries
      .filter((entry) => entry.includes(segment.captureTestName))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

    if (!match) {
      throw new Error(
        `${segment.captureTestName} の録画が見つかりません。test-results を確認してください。`,
      );
    }

    return {
      ...segment,
      path: match,
    };
  });
}

const segments = collectRecordedSegments();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const filterGraph = segments
  .map((segment, index) => {
    const duration = segment.end - segment.start;
    const fadeOutStart = Math.max(duration - 0.18, 0);
    return [
      `[${index}:v]trim=start=${segment.start}:end=${segment.end}`,
      "setpts=PTS-STARTPTS",
      "fps=30",
      "scale=1440:900:force_original_aspect_ratio=increase",
      "crop=1440:900",
      "fade=t=in:st=0:d=0.18",
      `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.18[v${index}]`,
    ].join(",");
  })
  .concat(
    `${segments.map((_, index) => `[v${index}]`).join("")}concat=n=${segments.length}:v=1:a=0[outv]`,
  )
  .join(";");

const ffmpegArgs = segments
  .flatMap((segment) => ["-i", segment.path])
  .concat([
    "-filter_complex",
    filterGraph,
    "-map",
    "[outv]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ]);

execFileSync("ffmpeg", ffmpegArgs, {
  cwd: repoRoot,
  stdio: "inherit",
});
