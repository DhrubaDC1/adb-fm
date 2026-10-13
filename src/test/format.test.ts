import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatSpeed,
  getFileCategory,
  getFileExtension,
} from "../utils/format";

describe("format utility functions", () => {
  it("formats byte sizes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("formats speed values correctly", () => {
    expect(formatSpeed(0)).toBe("0 B/s");
    expect(formatSpeed(1048576)).toBe("1 MB/s");
    expect(formatSpeed(15728640)).toBe("15 MB/s");
  });

  it("formats durations correctly", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(3665)).toBe("1h 1m");
  });

  it("identifies file categories and extensions accurately", () => {
    expect(getFileExtension("photo.jpg")).toBe("jpg");
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
    expect(getFileExtension("noext")).toBe("");

    expect(getFileCategory("folder", true)).toBe("folder");
    expect(getFileCategory("photo.png", false)).toBe("image");
    expect(getFileCategory("movie.mp4", false)).toBe("video");
    expect(getFileCategory("song.mp3", false)).toBe("audio");
    expect(getFileCategory("archive.zip", false)).toBe("archive");
    expect(getFileCategory("app.apk", false)).toBe("apk");
    expect(getFileCategory("document.pdf", false)).toBe("document");
    expect(getFileCategory("code.rs", false)).toBe("code");
    expect(getFileCategory("unknown.xyz", false)).toBe("file");
  });
});
