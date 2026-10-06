"use strict";

const BLOCK_SIZE = 50;
const SHOW_LINK_AFTER_MS = 8000;   // これを過ぎたら暫定でリンクを出す（監視は継続）
const MIN_RENDERED_HEIGHT = 20;    // これ以上の高さが付いたら描画成功とみなす

/* ---------- 絞り込みの名簿 ----------
   パネルでの並べ方を決めるだけの表。ここに無い subject は「その他」に入る。
   ユニット回の subject は "SHHis(シーズ)" のように表記が揺れるので、
   ユニット名を含むかどうかで判定する。 */
const UNITS = [
  { name: "イルミネーションスターズ", members: ["櫻木 真乃", "風野 灯織", "八宮 めぐる"] },
  { name: "アンティーカ", members: ["月岡 恋鐘", "田中 摩美々", "白瀬 咲耶", "三峰 結華", "幽谷 霧子"] },
  { name: "放課後クライマックスガールズ", members: ["小宮 果穂", "園田 智代子", "西城 樹里", "杜野 凛世", "有栖川 夏葉"] },
  { name: "アルストロメリア", members: ["大崎 甘奈", "大崎 甜花", "桑山 千雪"] },
  { name: "ストレイライト", members: ["芹沢 あさひ", "黛 冬優子", "和泉 愛依"] },
  { name: "ノクチル", members: ["浅倉 透", "樋口 円香", "福丸 小糸", "市川 雛菜"] },
  { name: "シーズ", members: ["七草 にちか", "緋田 美琴"] },
  { name: "コメティック", members: ["斑鳩 ルカ", "鈴木 羽那", "郁田 はるき"] },
];
const OTHER_PEOPLE = ["七草 はづき"];
const OTHER_KEY = "その他";
const OTHER_LABEL = "イベント・全体回など";

let episodes = [];
let currentBlockIndex = 0;
let currentFilter = null; // null | ユニット名 | 人名 | OTHER_KEY
let filterOpen = false;
let filterCounts = new Map();

/* subject を絞り込みのキー（ユニット名・人名・その他）に寄せる。 */
function filterKeyFor(subject) {
  const s = subject || "";
  if (OTHER_PEOPLE.includes(s)) return s;
  for (const unit of UNITS) {
    if (unit.members.includes(s)) return s;
  }
  for (const unit of UNITS) {
    if (s.includes(unit.name)) return unit.name;
  }
  return OTHER_KEY;
}

function filterLabel(key) {
  return key === OTHER_KEY ? OTHER_LABEL : key;
}

function setFilter(key) {
  currentFilter = key;
  filterOpen = false;
  const url = new URL(location.href);
  if (key) url.searchParams.set("subject", key);
  else url.searchParams.delete("subject");
  history.replaceState(null, "", url);
  render();
}

/* ---------- 話数ブロックの区切り ----------
   ブロック0 は 0〜50（第0話を含むので51枠）。
   以降は 51〜100, 101〜150 ... と50話刻み。 */
function blockBounds(index) {
  if (index === 0) return { start: 0, end: 50 };
  const start = 51 + (index - 1) * BLOCK_SIZE;
  return { start, end: start + BLOCK_SIZE - 1 };
}

function blockIndexForNum(num) {
  return num <= 50 ? 0 : Math.floor((num - 51) / BLOCK_SIZE) + 1;
}

/* ---------- X公式ウィジェット ---------- */
let widgetsPromise = null;
function loadWidgets() {
  if (widgetsPromise) return widgetsPromise;
  widgetsPromise = new Promise((resolve, reject) => {
    if (window.twttr && window.twttr.widgets) return resolve(window.twttr);
    const script = document.createElement("script");
    script.src = "https://platform.x.com/widgets.js";
    script.async = true;
    script.onload = () =>
      window.twttr && window.twttr.widgets
        ? resolve(window.twttr)
        : reject(new Error("twttr の初期化に失敗しました"));
    script.onerror = () => reject(new Error("widgets.js を読み込めませんでした"));
    document.body.appendChild(script);
  });
  return widgetsPromise;
}

/* ---------- 埋め込みの状態管理 ----------
   createTweet の Promise は当てにしない。埋め込みが描画されても解決しない
   ことがあるため、「ホストに実際の高さが付いたか」を唯一の成功判定とする。
   時間切れは失敗ではなく暫定表示。遅れて描画されたら埋め込みに戻す。 */
function setKomaState(koma, state) {
  koma.dataset.embedState = state;
  const note = koma.querySelector(".loading-note");
  const link = koma.querySelector(".tweet-link");
  const showLink = state === "fallback" || state === "failed";
  note.hidden = state !== "idle" && state !== "loading";
  link.hidden = !showLink;
}

function mountEmbed(koma) {
  const host = koma.querySelector(".embed-host");
  const tweetId = koma.dataset.tweetId;
  let timer = null;
  let resizeObserver = null;

  const stopWatching = () => {
    if (timer) clearTimeout(timer);
    if (resizeObserver) resizeObserver.disconnect();
  };

  const succeed = () => {
    stopWatching();
    setKomaState(koma, "done");
  };

  // 削除済みツイートやスクリプト読み込み失敗など、確定的な失敗のみDOMを片付ける
  const hardFail = () => {
    stopWatching();
    host.innerHTML = "";
    setKomaState(koma, "failed");
  };

  setKomaState(koma, "loading");

  resizeObserver = new ResizeObserver(() => {
    if (host.offsetHeight >= MIN_RENDERED_HEIGHT) succeed();
  });
  resizeObserver.observe(host);

  timer = setTimeout(() => {
    if (host.offsetHeight >= MIN_RENDERED_HEIGHT) succeed();
    else setKomaState(koma, "fallback"); // 監視は続けたままリンクを先に出す
  }, SHOW_LINK_AFTER_MS);

  loadWidgets()
    .then((twttr) =>
      twttr.widgets.createTweet(tweetId, host, {
        theme: "light",
        dnt: true,
        conversation: "none",
        align: "center",
      })
    )
    .then((el) => {
      if (!el) hardFail();
    })
    .catch(hardFail);
}

/* 画面に入ったコマだけ埋め込む。50枚を一度に読むと重いため。 */
const lazyObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      lazyObserver.unobserve(entry.target);
      mountEmbed(entry.target);
    }
  },
  { rootMargin: "300px" }
);

/* ---------- 描画 ---------- */
function buildKoma(ep, isLatest) {
  const koma = document.createElement("div");
  koma.className = "koma" + (isLatest ? " latest" : "");
  koma.dataset.tweetId = ep.id;
  koma.dataset.embedState = "idle";

  const header = document.createElement("div");
  header.className = "koma-header";

  const label = document.createElement("div");
  label.className = "koma-label";

  const num = document.createElement("div");
  num.className = "koma-num";
  num.textContent = ep.num === 0 ? "0話" : "第" + ep.num + "話";
  label.appendChild(num);

  if (ep.title) {
    const title = document.createElement("div");
    title.className = "koma-title";
    title.textContent = "『" + ep.title + "』";
    label.appendChild(title);
  }
  header.appendChild(label);

  if (ep.date) {
    const date = document.createElement("div");
    date.className = "date";
    date.textContent = ep.date;
    header.appendChild(date);
  }
  koma.appendChild(header);

  if (ep.subject) {
    const subject = document.createElement("button");
    subject.type = "button";
    subject.className = "koma-subject";
    subject.textContent = ep.filterKey === OTHER_KEY ? ep.subject : ep.filterKey;
    subject.title = filterLabel(ep.filterKey) + "で絞り込む";
    subject.addEventListener("click", () => setFilter(ep.filterKey));
    koma.appendChild(subject);
  }

  const embed = document.createElement("div");
  embed.className = "koma-embed";

  // widgets.js がDOMを直接書き換える領域
  const host = document.createElement("div");
  host.className = "embed-host";
  embed.appendChild(host);

  const note = document.createElement("span");
  note.className = "loading-note";
  note.textContent = "ツイートを読み込み中…";
  embed.appendChild(note);

  const link = document.createElement("a");
  link.className = "tweet-link";
  link.href = ep.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.hidden = true;
  const linkText = document.createElement("span");
  linkText.textContent = "ツイートを見る ↗";
  link.appendChild(linkText);
  embed.appendChild(link);

  koma.appendChild(embed);
  lazyObserver.observe(koma);
  return koma;
}

function buildFilterName(key, extraClass) {
  const count = filterCounts.get(key) || 0;
  if (!count) {
    const span = document.createElement("span");
    span.className = "filter-name disabled" + (extraClass ? " " + extraClass : "");
    span.textContent = filterLabel(key);
    return span;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "filter-name" + (extraClass ? " " + extraClass : "") + (key === currentFilter ? " current" : "");
  btn.textContent = filterLabel(key);
  const small = document.createElement("small");
  small.textContent = count;
  btn.appendChild(small);
  btn.addEventListener("click", () => setFilter(key));
  return btn;
}

function buildFilterRow(headCell, keys) {
  const members = document.createElement("div");
  members.className = "filter-members";
  for (const key of keys) members.appendChild(buildFilterName(key));
  return [headCell, members];
}

function renderFilter() {
  const bar = document.getElementById("filterBar");
  bar.innerHTML = "";

  const controls = document.createElement("div");
  controls.className = "filter-controls";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "filter-toggle";
  toggle.setAttribute("aria-expanded", String(filterOpen));
  toggle.textContent =
    (currentFilter ? "変更" : "誰のお話かで絞り込む") + (filterOpen ? " ▴" : " ▾");
  toggle.addEventListener("click", () => {
    filterOpen = !filterOpen;
    renderFilter();
  });
  controls.appendChild(toggle);

  if (currentFilter) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "filter-current";
    clear.textContent = filterLabel(currentFilter) + " ×";
    clear.setAttribute("aria-label", filterLabel(currentFilter) + "の絞り込みを解除");
    clear.addEventListener("click", () => setFilter(null));
    controls.appendChild(clear);
  }
  bar.appendChild(controls);

  if (!filterOpen) return;

  const panel = document.createElement("div");
  panel.className = "filter-panel";
  for (const unit of UNITS) {
    panel.append(...buildFilterRow(buildFilterName(unit.name, "filter-unit"), unit.members));
  }
  const otherHead = document.createElement("span");
  otherHead.className = "filter-name disabled filter-unit";
  otherHead.textContent = "その他";
  panel.append(...buildFilterRow(otherHead, [...OTHER_PEOPLE, OTHER_KEY]));
  bar.appendChild(panel);
}

/* 絞り込み中は話数レンジを使わず、該当する話を話数順に全件並べる。 */
function renderFiltered(container, latestNum) {
  const items = episodes.filter((e) => e.filterKey === currentFilter);

  const section = document.createElement("section");
  section.className = "range";

  const head = document.createElement("div");
  head.className = "range-head";
  const rangeNum = document.createElement("span");
  rangeNum.className = "range-num";
  rangeNum.textContent =
    currentFilter === OTHER_KEY ? OTHER_LABEL : currentFilter + "のお話";
  const count = document.createElement("span");
  count.className = "range-count";
  count.textContent = items.length + "件";
  head.appendChild(rangeNum);
  head.appendChild(count);
  section.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "komas";
  for (const ep of items) grid.appendChild(buildKoma(ep, ep.num === latestNum));
  section.appendChild(grid);
  container.appendChild(section);
}

function render() {
  const toc = document.getElementById("tocNav");
  const container = document.getElementById("rangesContainer");
  toc.innerHTML = "";
  container.innerHTML = "";

  if (!episodes.length) return;

  renderFilter();

  const latestNum = episodes[episodes.length - 1].num;

  toc.hidden = Boolean(currentFilter);
  if (currentFilter) {
    renderFiltered(container, latestNum);
    return;
  }
  const highestBlock = blockIndexForNum(latestNum);

  for (let i = 0; i <= highestBlock; i++) {
    const b = blockBounds(i);
    const btn = document.createElement("button");
    btn.textContent = b.start + "〜" + b.end + "話";
    if (i === currentBlockIndex) btn.className = "active";
    btn.addEventListener("click", () => {
      currentBlockIndex = i;
      render();
    });
    toc.appendChild(btn);
  }

  const bounds = blockBounds(currentBlockIndex);
  const items = episodes.filter((e) => e.num >= bounds.start && e.num <= bounds.end);

  const section = document.createElement("section");
  section.className = "range";

  const head = document.createElement("div");
  head.className = "range-head";
  const rangeNum = document.createElement("span");
  rangeNum.className = "range-num";
  rangeNum.textContent = bounds.start + "〜" + bounds.end + "話";
  const count = document.createElement("span");
  count.className = "range-count";
  count.textContent =
    "収集済み " + items.length + " / " + (bounds.end - bounds.start + 1);
  head.appendChild(rangeNum);
  head.appendChild(count);
  section.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "komas";

  for (let n = bounds.start; n <= bounds.end; n++) {
    const ep = items.find((i) => i.num === n);
    if (ep) {
      grid.appendChild(buildKoma(ep, ep.num === latestNum));
    } else {
      const empty = document.createElement("div");
      empty.className = "koma empty-slot";
      empty.textContent = n + "話 未収集";
      grid.appendChild(empty);
    }
  }

  section.appendChild(grid);
  container.appendChild(section);
}

function showNotice(message) {
  const el = document.getElementById("notice");
  el.textContent = message;
  el.hidden = false;
}

/* ---------- 起動 ----------
   GitHub Pages ではサブパス配信になるため、必ず相対パスで読むこと。 */
async function init() {
  let raw;
  try {
    const res = await fetch("./episodes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    raw = await res.json();
  } catch (err) {
    showNotice("台帳データを読み込めませんでした（" + err.message + "）。");
    return;
  }

  episodes = raw
    .filter((e) => e && typeof e.num === "number" && e.id && e.url)
    .sort((a, b) => a.num - b.num);

  if (!episodes.length) {
    showNotice("まだ登録された話がありません。");
    return;
  }

  for (const ep of episodes) {
    ep.filterKey = filterKeyFor(ep.subject);
    filterCounts.set(ep.filterKey, (filterCounts.get(ep.filterKey) || 0) + 1);
  }

  // 既定では最新話を含むブロックを開く
  currentBlockIndex = blockIndexForNum(episodes[episodes.length - 1].num);

  // ?subject=大崎 甘奈 のようなURLで絞り込み済みの状態を開けるようにする
  const requested = new URLSearchParams(location.search).get("subject");
  if (requested && filterCounts.has(requested)) currentFilter = requested;
  render();
}

init();
