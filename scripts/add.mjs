#!/usr/bin/env node
/**
 * 台帳にエピソードを追加する。
 *
 *   npm run add -- <URL または ID> [...]
 *   npm run add -- <URL> --num 123 --title "タイトル"   # 自動判定の上書き
 *   npm run refresh                                      # 既存全件のメタを取り直す
 *
 * episodes.json が唯一の正データ。人が叩いてもcronが叩いても結果は同じ。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tweetIdFrom, buildEntry } from "../lib/tweet.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "episodes.json");

function parseArgs(argv) {
  const targets = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--refresh") opts.refresh = true;
    else if (a === "--num") opts.num = Number(argv[++i]);
    else if (a === "--title") opts.title = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--")) throw new Error(`不明なオプション: ${a}`);
    else targets.push(a);
  }
  return { targets, opts };
}

async function readLedger() {
  try {
    return JSON.parse(await readFile(DATA, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function writeLedger(list) {
  const sorted = [...list].sort((a, b) => a.num - b.num);
  await writeFile(DATA, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  return sorted;
}

async function main() {
  const { targets, opts } = parseArgs(process.argv.slice(2));
  const ledger = await readLedger();

  if (opts.refresh) {
    let changed = 0;
    for (const ep of ledger) {
      const fresh = await buildEntry(ep.id, { num: ep.num });
      if (fresh.title !== ep.title || fresh.date !== ep.date) {
        console.log(`更新 第${ep.num}話: ${ep.title || "(無題)"} -> ${fresh.title || "(無題)"} / ${ep.date} -> ${fresh.date}`);
        Object.assign(ep, fresh);
        changed++;
      }
    }
    if (!opts.dryRun) await writeLedger(ledger);
    console.log(`\n${ledger.length}件を確認、${changed}件を更新しました。`);
    return;
  }

  if (targets.length === 0) {
    console.error("使い方: npm run add -- <ツイートURL> [--num N] [--title \"...\"]");
    process.exit(1);
  }
  if (targets.length > 1 && (opts.num !== undefined || opts.title !== undefined)) {
    console.error("--num / --title は1件ずつ指定してください。");
    process.exit(1);
  }

  const byId = new Map(ledger.map((e) => [e.id, e]));
  let added = 0;

  for (const target of targets) {
    const id = tweetIdFrom(target);
    if (!id) {
      console.error(`✗ ツイートIDを取り出せません: ${target}`);
      continue;
    }
    if (byId.has(id)) {
      console.log(`- 登録済みのためスキップ: 第${byId.get(id).num}話 (${id})`);
      continue;
    }

    let entry;
    try {
      entry = await buildEntry(id, opts);
    } catch (e) {
      console.error(`✗ ${target}: ${e.message}`);
      continue;
    }

    if (entry.num === null || Number.isNaN(entry.num)) {
      console.error(`✗ 本文から話数を判定できませんでした (${id})。--num で指定してください。`);
      continue;
    }

    const clash = ledger.find((e) => e.num === entry.num);
    if (clash) {
      console.error(`✗ 第${entry.num}話は既に別のツイートで登録済みです (${clash.id})。`);
      continue;
    }

    ledger.push(entry);
    byId.set(id, entry);
    added++;
    console.log(`✓ 第${entry.num}話「${entry.title || "無題"}」 ${entry.date}`);
  }

  if (added === 0) {
    console.log("\n追加はありませんでした。");
    return;
  }
  if (opts.dryRun) {
    console.log(`\n[dry-run] ${added}件を追加する予定でした（未保存）。`);
    return;
  }
  const sorted = await writeLedger(ledger);
  console.log(`\n${added}件を追加しました。台帳は全${sorted.length}件です。`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
