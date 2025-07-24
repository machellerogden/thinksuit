import { open, readFile, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';

/**
 * Check if a file or directory exists (async version)
 * @param {string} path - Path to check
 * @returns {Promise<boolean>} True if exists, false otherwise
 */
export async function exists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read lines from a specific index to the end of file efficiently
 * @param {string} filePath
 * @param {number} fromIndex // zero-based
 * @param {{ encoding?: BufferEncoding, bufferSize?: number }} [opts]
 * @returns {Promise<string[]>} Lines from fromIndex to EOF (preserves empty lines)
 */
export async function readLinesFrom(filePath, fromIndex, opts = {}) {
    const encoding = opts.encoding ?? 'utf8';
    const bufferSize = opts.bufferSize ?? 64 * 1024; // 64 KiB

    if (!Number.isInteger(fromIndex) || fromIndex < 0) {
        throw new Error('fromIndex must be a non-negative integer');
    }

    // NOTE: We normalize line breaks with a regex split; we DO NOT trim or filter.
    if (fromIndex === 0) {
        const data = await readFile(filePath, { encoding });
        // Split on CRLF, LF, or CR. Keep empty lines (no filter).
        return data.split(/\r\n|\n|\r/);
    }

    const fh = await open(filePath, 'r');
    try {
        const { size } = await fh.stat();
        if (size === 0) return [];

        const cap = Math.min(bufferSize, size);
        const buf = Buffer.allocUnsafe(cap);

        let position = 0; // absolute file offset of this read window
        let lineIndex = 0; // zero-based index of the NEXT line to start
        let currentLineStart = 0; // absolute offset where the current line starts
        let targetStart = fromIndex === 0 ? 0 : -1;
        let prevWasCR = false;

        // Scan forward to locate byte offset of the start of line[fromIndex]
        while (position < size && targetStart === -1) {
            const toRead = Math.min(cap, size - position);
            const { bytesRead } = await fh.read(buf, 0, toRead, position);
            if (bytesRead === 0) break;

            for (let i = 0; i < bytesRead; i++) {
                const b = buf[i];

                if (b === 0x0a || b === 0x0d) {
                    // Collapse CRLF across and within chunks
                    const isCR = b === 0x0d;
                    const isLF = b === 0x0a;

                    // If previous chunk ended with CR and we’re on LF now, treat as single newline
                    const collapseAcrossChunks = prevWasCR && isLF;

                    // If CRLF entirely within this chunk, skip the LF byte
                    let step = 1;
                    if (isCR && i + 1 < bytesRead && buf[i + 1] === 0x0a) {
                        step = 2;
                    }

                    const advance = collapseAcrossChunks ? 0 : step - 1;
                    const nextLineStart = position + i + step;

                    lineIndex += 1;
                    if (lineIndex === fromIndex) {
                        targetStart = nextLineStart;
                        prevWasCR = false;
                        break;
                    }
                    currentLineStart = nextLineStart;
                    i += advance;
                    prevWasCR = isCR && step === 1 && i === bytesRead - 1; // CR at end without LF in chunk
                } else {
                    prevWasCR = false;
                }
            }

            // If the last byte of this chunk is CR and we didn't see LF, set flag
            if (bytesRead > 0 && buf[bytesRead - 1] === 0x0d) {
                prevWasCR = true;
            } else if (bytesRead > 0 && buf[bytesRead - 1] !== 0x0d) {
                prevWasCR = false;
            }

            position += bytesRead;
        }

        // If we reached EOF without hitting enough line breaks, we might still be inside
        // the final line. If that final line is exactly fromIndex, start there.
        if (targetStart === -1 && lineIndex === fromIndex) {
            targetStart = currentLineStart;
        }

        if (targetStart === -1 || targetStart > size) {
            // fromIndex is beyond EOF
            return [];
        }

        // Read from targetStart to EOF into a buffer (make sure to fill it fully)
        const remaining = size - targetStart;
        if (remaining === 0) return [];

        const out = Buffer.allocUnsafe(remaining);
        let filled = 0;
        while (filled < remaining) {
            const { bytesRead } = await fh.read(
                out,
                filled,
                remaining - filled,
                targetStart + filled
            );
            if (bytesRead === 0) break; // unexpected EOF; break to avoid infinite loop
            filled += bytesRead;
        }
        const text =
            filled === remaining
                ? out.toString(encoding)
                : out.subarray(0, filled).toString(encoding);

        // Split on any newline convention. Preserve empty lines.
        // If you want to ignore only a *trailing* empty line (common JSONL),
        // do: `const arr = text.split(/\r\n|\n|\r/); if (arr.length && arr[arr.length-1] === '') arr.pop(); return arr;`
        return text.split(/\r\n|\n|\r/);
    } finally {
        await fh.close();
    }
}

/**
 * Read the last line of a text file efficiently.
 * @param {string} filePath
 * @param {{encoding?: BufferEncoding, bufferSize?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function readLastLine(filePath, opts = {}) {
    const encoding = opts.encoding ?? 'utf8';
    const bufferSize = opts.bufferSize ?? 64 * 1024; // 64 KiB default

    const fh = await open(filePath, 'r');
    try {
        const { size } = await fh.stat();
        if (size === 0) return '';

        const cap = Math.min(bufferSize, size);
        const buf = Buffer.allocUnsafe(cap);

        // 1) Trim trailing \n / \r
        let pos = size; // exclusive end of the window we’re reading
        let end = size; // exclusive index after last non-newline byte
        while (pos > 0) {
            const len = Math.min(cap, pos);
            const off = pos - len;
            const { bytesRead } = await fh.read(buf, 0, len, off);

            let i = bytesRead - 1;
            while (i >= 0 && (buf[i] === 0x0a || buf[i] === 0x0d)) i--; // \n or \r
            if (i >= 0) {
                // found a non-newline byte
                end = off + i + 1; // exclusive
                break;
            }
            pos = off; // entire chunk was newlines; move earlier
        }
        // File is all newlines
        if (pos === 0 && end === size) return '';
        if (end === 0) return '';

        // 2) Find the preceding newline before `end`
        let searchPos = end;
        while (searchPos > 0) {
            const len = Math.min(cap, searchPos);
            const off = searchPos - len;
            const { bytesRead } = await fh.read(buf, 0, len, off);

            // Only examine bytes strictly before `end`
            const limit = Math.min(bytesRead, end - off); // exclusive
            const from = limit - 1;
            if (from >= 0) {
                // Prefer '\n' over '\r' so CRLF resolves to the '\n' position.
                const idxN = buf.lastIndexOf(0x0a, from);
                const idxR = buf.lastIndexOf(0x0d, from);
                const idx = Math.max(idxN, idxR);

                if (idx !== -1) {
                    const start = off + idx + 1;
                    const outLen = end - start;
                    if (outLen === 0) return '';
                    const out = Buffer.allocUnsafe(outLen);
                    await fh.read(out, 0, outLen, start);
                    return out.toString(encoding);
                }
            }
            searchPos = off; // move the window earlier
        }

        // 3) No newline found → entire (trimmed) file is the last line
        {
            const start = 0;
            const outLen = end - start;
            if (outLen === 0) return '';
            const out = Buffer.allocUnsafe(outLen);
            await fh.read(out, 0, outLen, start);
            return out.toString(encoding);
        }
    } finally {
        await fh.close();
    }
}

/**
 * Read only the data needed to determine session status efficiently.
 * Returns the last line and whether the file has only a single line.
 * @param {string} filePath
 * @param {{ encoding?: BufferEncoding, chunkSize?: number }} [opts]
 * @returns {Promise<{ lastLine: string, isSingleLine: boolean }>}
 */
export async function readSessionStatusData(filePath, opts = {}) {
    const encoding = opts.encoding ?? 'utf8';
    const chunkSize = opts.chunkSize ?? 64 * 1024; // 64 KiB

    const fh = await open(filePath, 'r');
    try {
        const { size } = await fh.stat();
        if (size === 0) return { lastLine: '', isSingleLine: true };

        // Large file - check for newlines while finding last line
        const lastLine = await scanLastLine(fh, size, chunkSize, encoding);

        // To determine if single line, scan from start for any newline
        const buf = Buffer.allocUnsafe(Math.min(chunkSize, size));
        let offset = 0;
        let foundNewline = false;

        while (offset < size && !foundNewline) {
            const { bytesRead } = await fh.read(buf, 0, Math.min(chunkSize, size - offset), offset);
            if (bytesRead === 0) break;

            for (let i = 0; i < bytesRead; i++) {
                if (buf[i] === 0x0a || buf[i] === 0x0d) {
                    foundNewline = true;
                    break;
                }
            }
            offset += bytesRead;
        }

        return {
            lastLine,
            isSingleLine: !foundNewline
        };
    } finally {
        await fh.close();
    }
}

/**
 * Return the first, second, and last line of a text file efficiently.
 * - Large-file path: forward scan until two newlines, backward scan for last line.
 *
 * @param {string} filePath
 * @param {{ encoding?: BufferEncoding, chunkSize?: number }} [opts]
 * @returns {Promise<{ first: string, second: string, last: string }>}
 */
export async function readFirstSecondAndLastLines(filePath, opts = {}) {
    const encoding = opts.encoding ?? 'utf8';
    const chunkSize = opts.chunkSize ?? 64 * 1024;

    const { size } = await stat(filePath);
    if (size === 0) return { first: '', second: '', last: '' };

    const fh = await open(filePath, 'r');
    try {
        const { first, second } = await scanFirstTwoLines(fh, chunkSize, encoding);
        const last = await scanLastNonEmptyLine(fh, size, chunkSize, encoding);
        return { first, second, last };
    } finally {
        await fh.close();
    }
}

/** Forward scan until we have two lines. */
async function scanFirstTwoLines(fh, chunkSize, encoding) {
    const buf = Buffer.allocUnsafe(chunkSize);
    const chunks = [];
    let lines = [];
    let start = 0;
    let offset = 0;
    let prevWasCR = false;

    while (lines.length < 2) {
        const { bytesRead } = await fh.read(buf, 0, chunkSize, offset);
        if (bytesRead === 0) break; // EOF
        const slice = buf.subarray(0, bytesRead);

        let i = 0;

        // If previous chunk ended with CR and this chunk begins with LF, collapse CRLF
        if (prevWasCR && i < slice.length && slice[i] === 0x0a) {
            // treat as continuation of the same newline; do not emit an empty line
            start = i + 1;
            prevWasCR = false;
            i++;
        }

        for (; i < slice.length && lines.length < 2; i++) {
            if (slice[i] === 0x0a || slice[i] === 0x0d) {
                const segment = slice.subarray(start, i);
                chunks.push(segment);
                lines.push(Buffer.concat(chunks));
                chunks.length = 0;

                // handle CRLF
                if (slice[i] === 0x0d && i + 1 < slice.length && slice[i + 1] === 0x0a) i++;
                start = i + 1;
            }
        }

        if (lines.length < 2 && start < slice.length) {
            chunks.push(slice.subarray(start));
        }
        offset += bytesRead;

        // Remember if this chunk ends with a CR without a following LF (boundary split)
        prevWasCR = bytesRead > 0 && slice[bytesRead - 1] === 0x0d;
    }

    if (lines.length < 2 && chunks.length) {
        lines.push(Buffer.concat(chunks));
    }
    while (lines.length < 2) lines.push(Buffer.alloc(0));

    return {
        first: lines[0].toString(encoding),
        second: lines[1].toString(encoding)
    };
}

async function scanLastNonEmptyLine(fh, size, chunkSize, encoding) {
    const cap = Math.min(chunkSize, size);
    const buf = Buffer.allocUnsafe(cap);

    // Helper: test if a slice is only \r,\n, or spaces/tabs.
    const isBlank = (b, start, end) => {
        for (let i = start; i < end; i++) {
            const c = b[i];
            if (!(c === 0x0a || c === 0x0d || c === 0x20 || c === 0x09)) return false;
        }
        return true;
    };

    // Step 1: trim trailing newline/CR/space/tab
    let pos = size;
    let end = size;
    while (pos > 0) {
        const len = Math.min(cap, pos);
        const off = pos - len;
        const { bytesRead } = await fh.read(buf, 0, len, off);

        let i = bytesRead - 1;
        // trim \n, \r, space, tab
        while (i >= 0 && (buf[i] === 0x0a || buf[i] === 0x0d || buf[i] === 0x20 || buf[i] === 0x09))
            i--;
        if (i >= 0) {
            end = off + i + 1;
            break;
        }
        pos = off;
    }
    if (end === 0) return ''; // file all blank

    // Step 2: find the previous newline, but skip blank "lines" as needed
    let searchPos = end;
    while (searchPos > 0) {
        const len = Math.min(cap, searchPos);
        const off = searchPos - len;
        const { bytesRead } = await fh.read(buf, 0, len, off);

        const limit = Math.min(bytesRead, end - off);
        let i = limit - 1;

        // Scan backward across the current (candidate) line
        let lineEnd = off + i + 1; // exclusive
        // find start of this candidate line
        while (i >= 0 && buf[i] !== 0x0a && buf[i] !== 0x0d) i--;
        const lineStart = off + i + 1;

        // Check if candidate is blank
        if (!isBlank(buf, lineStart - off, lineEnd - off)) {
            const outLen = lineEnd - lineStart;
            const out = Buffer.allocUnsafe(outLen);
            await fh.read(out, 0, outLen, lineStart);
            return out.toString(encoding);
        }

        // Candidate was blank → move end to start of that line and continue
        end = lineStart;
        searchPos = off;
    }

    // If we got here, the only non-blank content is from 0..end
    const out = Buffer.allocUnsafe(end);
    await fh.read(out, 0, end, 0);
    return out.toString(encoding);
}

/** Backward scan: trim trailing newlines, then find the preceding newline. */
async function scanLastLine(fh, size, chunkSize, encoding) {
    const cap = Math.min(chunkSize, size);
    const buf = Buffer.allocUnsafe(cap);

    // Step 1: find `end` = index after last non-newline byte
    let pos = size;
    let end = size;
    while (pos > 0) {
        const len = Math.min(cap, pos);
        const off = pos - len;
        const { bytesRead } = await fh.read(buf, 0, len, off);

        let i = bytesRead - 1;
        while (i >= 0 && (buf[i] === 0x0a || buf[i] === 0x0d)) i--;
        if (i >= 0) {
            end = off + i + 1;
            break;
        }
        pos = off; // this chunk was all newlines; move earlier
    }
    if (pos === 0 && end === size) return ''; // file is only newlines
    if (end === 0) return '';

    // Step 2: find start of last line (after the previous newline before `end`)
    let searchPos = end;
    while (searchPos > 0) {
        const len = Math.min(cap, searchPos);
        const off = searchPos - len;
        const { bytesRead } = await fh.read(buf, 0, len, off);

        const limit = Math.min(bytesRead, end - off);
        const from = limit - 1;
        if (from >= 0) {
            const idxN = buf.lastIndexOf(0x0a, from);
            const idxR = buf.lastIndexOf(0x0d, from);
            const nl = Math.max(idxN, idxR);
            if (nl !== -1) {
                const start = off + nl + 1;
                const outLen = end - start;
                if (outLen === 0) return '';
                const out = Buffer.allocUnsafe(outLen);
                await fh.read(out, 0, outLen, start);
                return out.toString(encoding);
            }
        }
        searchPos = off;
    }

    // Step 3: no newline found → entire (trimmed) file is one line
    const out = Buffer.allocUnsafe(end);
    await fh.read(out, 0, end, 0);
    return out.toString(encoding);
}
