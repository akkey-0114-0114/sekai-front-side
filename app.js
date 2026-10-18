const API_BASE = "http://tokyo.sorahost.net:60875";
const POLL_MS = 10 * 60 * 1000;

const updatedEl = document.querySelector("#updated");
const countEl = document.querySelector("#count");
const boardEl = document.querySelector("#board");
const messageEl = document.querySelector("#message");
const formEl = document.querySelector("#search-form");
const inputEl = document.querySelector("#q");

const state = {
  players: [],
  seasonId: null,
  updatedAt: "",
  live: false,
  query: "",
};

const numberFormat = new Intl.NumberFormat("ja-JP");
const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function canCallApi() {
  return location.protocol !== "https:" || API_BASE.startsWith("https:");
}

function norm(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function initial(name) {
  const text = String(name || "").trim();
  if (!text) return "・";
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const part = new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)[Symbol.iterator]().next();
    if (part.value) return part.value.segment;
  }
  return Array.from(text)[0];
}

function xHref(id) {
  if (!id || !/^[\w.]+$/.test(id)) return "";
  return `https://x.com/${id}`;
}

function imageSrc(player) {
  const path = player.characterImage || "";
  if (!path) return "";
  if (location.protocol === "https:" && path.startsWith("http:")) {
    return `images/${encodeURIComponent(player.userId)}.png`;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

function matches(player, query) {
  if (!query) return true;
  const needle = norm(query).replace(/^@+/, "");
  if (!needle) return true;
  const x = norm(player.twitterId).replace(/^@+/, "");
  return norm(player.name).includes(needle)
    || norm(player.userId).includes(needle)
    || (x && x.includes(needle));
}

function formatUpdated(iso, seasonId) {
  const season = seasonId == null ? "" : `シーズン${seasonId}　`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return `${season}更新時刻不明`;
  return `${season}${timeFormat.format(date)}更新`;
}

function setMessage(text, withRetry) {
  messageEl.replaceChildren();
  if (!text) {
    messageEl.hidden = true;
    return;
  }
  messageEl.hidden = false;
  const line = document.createElement("p");
  line.textContent = text;
  messageEl.append(line);
  if (withRetry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "再読み込み";
    button.addEventListener("click", () => load(true));
    messageEl.append(button);
  }
}

function portrait(player) {
  const frame = document.createElement("div");
  frame.className = "portrait";
  const src = imageSrc(player);
  if (!src) {
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = initial(player.name);
    frame.append(mark);
    return frame;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.width = 68;
  img.height = 68;
  img.decoding = "async";
  img.loading = "lazy";
  img.src = src;
  img.addEventListener("error", () => {
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = initial(player.name);
    img.replaceWith(mark);
  });
  frame.append(img);
  return frame;
}

function render() {
  const shown = state.players
    .map((player, index) => ({ player, rank: index + 1 }))
    .filter(({ player }) => matches(player, state.query));

  countEl.textContent = state.players.length
    ? (state.query ? `${shown.length}人 / ${state.players.length}人` : `${state.players.length}人`)
    : "";

  boardEl.replaceChildren();
  if (!state.players.length) return;

  if (!shown.length) {
    setMessage("該当するプレイヤーはいません。", false);
    return;
  }
  setMessage("", false);

  const fragment = document.createDocumentFragment();
  for (const { player, rank } of shown) {
    const item = document.createElement("li");
    item.className = "player";

    const rankEl = document.createElement("p");
    rankEl.className = rank <= 3 ? "rank top" : "rank";
    if (rank >= 100) rankEl.classList.add("dense");
    rankEl.textContent = String(rank);

    const who = document.createElement("div");
    who.className = "who";

    const name = document.createElement("p");
    name.className = "name";
    name.textContent = String(player.name || "").trim() || "（名前なし）";

    const tier = document.createElement("p");
    tier.className = "tier";
    tier.textContent = player.tier || "";

    const ids = document.createElement("p");
    ids.className = "ids";
    const uid = document.createElement("span");
    uid.className = "uid";
    uid.textContent = `ID ${player.userId || ""}`;
    ids.append(uid);
    const href = xHref(player.twitterId || "");
    if (href) {
      ids.append("　");
      const link = document.createElement("a");
      link.className = "text-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `@${player.twitterId}`;
      ids.append(link);
    }

    const record = document.createElement("p");
    record.className = "record";
    const wins = numberFormat.format(player.winCount || 0);
    const losses = numberFormat.format(player.loseCount || 0);
    const draws = numberFormat.format(player.drawCount || 0);
    const streak = numberFormat.format(player.maxConsecutiveWinCount || 0);
    for (const label of [`${wins}勝`, `${losses}敗`, `${draws}分`, `最大${streak}連勝`]) {
      const stat = document.createElement("span");
      stat.textContent = label;
      record.append(stat);
    }

    who.append(name, tier, ids, record);
    if (!player.tier) tier.remove();

    const points = document.createElement("p");
    points.className = "points";
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = numberFormat.format(player.points || 0);
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "ポイント";
    points.append(num, unit);

    item.append(rankEl, portrait(player), who, points);
    fragment.append(item);
  }
  boardEl.append(fragment);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  const data = await response.json();
  if (!data || !Array.isArray(data.players)) throw new Error("invalid");
  return data;
}

async function load(manual) {
  if (!state.players.length || manual) {
    updatedEl.textContent = "読み込んでいます";
    setMessage(state.players.length ? "" : "読み込んでいます", false);
  }

  let data = null;
  let live = false;
  if (canCallApi()) {
    try {
      data = await fetchJson(`${API_BASE}/ranking`);
      live = true;
    } catch {
      data = null;
    }
  }
  if (!data) {
    try {
      data = await fetchJson(new URL("data/ranking.json", document.baseURI).href);
      live = false;
    } catch {
      data = null;
    }
  }

  if (!data) {
    if (!state.players.length) {
      updatedEl.textContent = "取得できませんでした";
      boardEl.replaceChildren();
      countEl.textContent = "";
      setMessage("ランキングを取得できませんでした。", true);
    }
    return;
  }

  const stamp = `${data.updatedAt}|${data.players.length}|${data.seasonId}`;
  const same = stamp === state.stamp && live === state.live;
  state.live = live;
  state.stamp = stamp;
  state.players = data.players;
  state.seasonId = data.seasonId;
  state.updatedAt = data.updatedAt;
  updatedEl.textContent = formatUpdated(data.updatedAt, data.seasonId);
  if (!same || manual) render();
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  inputEl.blur();
});

inputEl.addEventListener("input", () => {
  state.query = inputEl.value;
  const url = new URL(location.href);
  const value = state.query.trim();
  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
  if (state.players.length) render();
});

const initialQuery = new URL(location.href).searchParams.get("q") || "";
if (initialQuery) {
  inputEl.value = initialQuery;
  state.query = initialQuery;
}

load(false);
setInterval(() => {
  if (canCallApi()) load(false);
}, POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && canCallApi()) load(false);
});
