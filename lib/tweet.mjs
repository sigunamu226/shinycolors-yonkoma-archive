const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** ツイートURL（x.com / twitter.com どちらでも）から数値IDを取り出す。 */
export function tweetIdFrom(input) {
  const s = String(input).trim();
  if (/^\d{10,}$/.test(s)) return s; // 生のIDを直接渡された場合
  const m = s.match(/status\/(\d+)/);
  return m ? m[1] : null;
}

const toHalfWidth = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 本文から話数とサブタイトルを推定する。
 * 「第12話「タイトル」」の形を主に想定し、取れなければ num: null を返す。
 */
export function parseEpisode(text) {
  const t = toHalfWidth(String(text || ""));
  const numMatch = t.match(/第\s*(\d+)\s*話/);
  const num = numMatch ? Number(numMatch[1]) : null;

  let title = "";
  if (numMatch) {
    // 話数の直後の鉤括弧を最優先で拾う
    const after = t.slice(numMatch.index + numMatch[0].length);
    const m = after.match(/^\s*[「『]([^」』]+)[」』]/);
    if (m) title = m[1];
  }
  if (!title) {
    const m = t.match(/[「『]([^」』]+)[」』]/);
    if (m) title = m[1];
  }
  return { num, title };
}

/** 認証不要の syndication エンドポイントからツイート情報を取得する。 */
export async function fetchTweet(id) {
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=ja&token=a`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 404) throw new Error(`ツイートが見つかりません (id=${id})`);
  if (!res.ok) throw new Error(`tweet-result が HTTP ${res.status} を返しました`);
  const data = await res.json();
  if (!data || !data.text) throw new Error(`本文を取得できませんでした (id=${id})`);
  return data;
}

/** ツイートID一件を、台帳に入れる形に正規化する。 */
export async function buildEntry(id, overrides = {}) {
  const data = await fetchTweet(id);
  const parsed = parseEpisode(data.text);
  const screenName = data.user?.screen_name || "imassc_official";
  return {
    num: overrides.num ?? parsed.num,
    id,
    url: `https://x.com/${screenName}/status/${id}`,
    date: (data.created_at || "").slice(0, 10),
    title: overrides.title ?? parsed.title,
  };
}
