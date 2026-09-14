/* Shared by the background worker and the fallback for local file previews. */
(() => {
  "use strict";

  const MAX_INPUT = 256_000;
  const MAX_DEPTH = 99;
  const MAX_ATTEMPTS = 4_000;
  const MAX_LINKS = 200;
  const MAX_DECODED = 2_000_000;
  const utf8 = new TextDecoder("utf-8", { fatal: true });

  const preview = text => text.length > 180 ? text.slice(0, 180) + "…" : text;

  function encodeLayers(input, layers) {
    if (!Number.isInteger(layers) || layers < 1 || layers > MAX_DEPTH) {
      return { value: "", steps: [], error: `Choose 1–${MAX_DEPTH} layers.` };
    }
    if (input.length > MAX_INPUT) return { value: "", steps: [], error: "Message too large." };
    if (!input) return { value: "", steps: [] };
    let value = input;
    const steps = [];
    for (let depth = 1; depth <= layers; depth++) {
      // Only the first layer needs UTF-8 conversion; subsequent layers are ASCII.
      const bytes = depth === 1 ? new TextEncoder().encode(value) : null;
      if (4 * Math.ceil((bytes ? bytes.length : value.length) / 3) > 1_000_000) {
        return { value: "", steps: [], error: depth > 1
          ? `×${layers} exceeds 1 MB. Try ×${depth - 1} or less.`
          : "Shorten this text (1 MB output limit)." };
      }
      if (bytes) {
        const chunks = [];
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
        }
        value = chunks.join("");
      }
      value = btoa(value);
      steps.push({ depth, text: preview(value) });
    }
    return { value, steps };
  }

  function cleanURL(value) {
    const balance = { ")": 0, "]": 0, "}": 0 };
    const openings = { "(": ")", "[": "]", "{": "}" };
    for (const char of value) {
      if (Object.hasOwn(balance, char)) balance[char]++;
      else if (Object.hasOwn(openings, char)) balance[openings[char]]--;
    }
    let end = value.length;
    while (end) {
      const char = value[end - 1];
      if (/[.,;:!?]/.test(char)) end--;
      else if (balance[char] > 0) { balance[char]--; end--; }
      else break;
    }
    return value.slice(0, end);
  }

  function decode(candidate) {
    const normalized = candidate.replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
    const unpadded = normalized.replace(/=+$/, "");
    if (unpadded.length % 4 === 1) return null;
    // Accept omitted padding, but reject incorrectly supplied padding.
    if (normalized.includes("=") && normalized.length % 4 !== 0) return null;
    try {
      const binary = atob(unpadded + "=".repeat((4 - unpadded.length % 4) % 4));
      const decoded = utf8.decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
      return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded) ? null : decoded;
    } catch {
      return null;
    }
  }

  function findLinks(input) {
    if (input.length > MAX_INPUT) {
      return { links: [], limited: true, error: "That’s a big paste. Try a message under 256,000 characters." };
    }
    const queue = [{ text: input, depth: 0, parent: -1 }];
    function pathTo(index) {
      const steps = [];
      while (queue[index].parent !== -1) {
        const node = queue[index];
        steps.push({ depth: node.depth, text: preview(node.text) });
        index = node.parent;
      }
      return steps.reverse();
    }
    const seenText = new Set([input]);
    const seenCandidates = new Set();
    const links = new Map();
    let attempts = 0;
    let decodedSize = 0;
    let limited = false;

    for (let index = 0; index < queue.length; index++) {
      const { text, depth } = queue[index];
      for (const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'`\\\u0000-\u001f\u007f]+/gi)) {
        const value = cleanURL(match[0]);
        try {
          const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
          if (!["http:", "https:"].includes(url.protocol) || !url.hostname) continue;
          if (/^www\./i.test(value) && !/^www\.[^.]+\..+/i.test(url.hostname)) continue;
          if (!links.has(url.href)) links.set(url.href, { url: url.href, depth, steps: pathTo(index) });
          if (links.size >= MAX_LINKS) { limited = true; break; }
        } catch { /* Ignore text that looks like a link but is not a URL. */ }
      }
      if (links.size >= MAX_LINKS) break;

      function enqueue(candidate) {
        if (seenCandidates.has(candidate)) return;
        if (attempts >= MAX_ATTEMPTS || decodedSize >= MAX_DECODED) { limited = true; return; }
        seenCandidates.add(candidate);
        attempts++;
        const decoded = decode(candidate);
        if (!decoded || seenText.has(decoded)) return;
        if (depth >= MAX_DEPTH || decodedSize + decoded.length > MAX_DECODED) { limited = true; return; }
        decodedSize += decoded.length;
        seenText.add(decoded);
        queue.push({ text: decoded, depth: depth + 1, parent: index });
      }

      // Recognize wrapped payloads before scanning tokens so a first line
      // cannot produce a misleading, truncated URL of its own.
      const wrapped = [];
      function standalonePayload(value) {
        for (let layer = 0; layer < MAX_DEPTH; layer++) {
          value = decode(value);
          if (!value) return false;
          if (/\b(?:https?:\/\/|www\.)/i.test(value)) return true;
        }
        return false;
      }
      function tryWrapped(value, start) {
        const parts = value.trim().split(/\s+/);
        if (parts.length < 2 || parts.length > 1000) return;
        const joined = parts.join("");
        if (!decode(joined) || parts.slice(1).some(standalonePayload)) return;
        enqueue(joined);
        wrapped.push([start, start + value.length]);
      }
      if (/^[\sA-Za-z0-9+/_=-]+$/.test(text) && /\s/.test(text)) tryWrapped(text, 0);
      if (!wrapped.length) {
        for (const match of text.matchAll(/(?:^[\t ]*[A-Za-z0-9+/_-]{8,}[\t ]*\r?\n)+^[\t ]*[A-Za-z0-9+/_-]+={0,2}[\t ]*(?:\r?\n|$)/gm)) {
          tryWrapped(match[0], match.index);
          if (attempts >= MAX_ATTEMPTS || decodedSize >= MAX_DECODED) break;
        }
      }

      // Look inside prose, JSON, quoted messages, and other decoded strings.
      let wrappedIndex = 0;
      for (const match of text.matchAll(/[A-Za-z0-9+/_-]{8,}={0,2}/g)) {
        while (wrappedIndex < wrapped.length && match.index >= wrapped[wrappedIndex][1]) wrappedIndex++;
        if (wrappedIndex < wrapped.length && match.index >= wrapped[wrappedIndex][0]) continue;
        enqueue(match[0]);
        if (attempts >= MAX_ATTEMPTS || decodedSize >= MAX_DECODED) { limited = true; break; }
      }
    }
    return { links: [...links.values()], limited, steps: links.size ? [] : pathTo(queue.length - 1) };
  }

  function transform(input, layers) {
    return { ...findLinks(input), encoding: encodeLayers(input, layers) };
  }

  globalThis.B64 = { findLinks, encodeLayers, transform, MAX_INPUT, MAX_DEPTH };
})();
