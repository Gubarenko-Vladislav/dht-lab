
"use strict";

// Алгоритмы Chord и Kademlia выполняются в Go.
// JavaScript только отправляет параметры и отображает результат.
const MIN_BITS = 1;
const MAX_BITS = 16;
const DEFAULT_BITS = 6;
const MAX_RANDOM_NODES = 100;

const DEFAULT_IDS = [
  4, 8, 14, 21, 32, 38, 42, 48, 51, 56,
];

const SVG_NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);

const ui = {
  ids: $("node-ids"),
  create: $("create-network"),
  random: $("random-network"),
  svg: $("network-svg"),
  algorithm: $("algorithm"),
  startNode: $("start-node"),
  target: $("target-id"),
  start: $("start-btn"),
  prev: $("prev-btn"),
  next: $("next-btn"),
  reset: $("reset-btn"),
  table: $("routing-table"),
  description: $("step-description"),
  steps: $("steps-list"),
  result: $("search-result"),
  hops: $("hops-count"),
  requests: $("requests-count"),
  rounds: $("rounds-count"),
};

const state = {
  bits: DEFAULT_BITS,
  ids: [...DEFAULT_IDS],
  lookup: null,
  algorithm: null,
  index: -1,
  loading: false,
  controller: null,
  version: 0,
};

function idSpace() {
  return 2 ** state.bits;
}

function maxID() {
  return idSpace() - 1;
}

// --------------------------------------
// Настройки сети и Kademlia
// --------------------------------------

function numberSetting(title, value, min, max) {
  const label = document.createElement("label");

  label.style.cssText =
    "display:grid;gap:6px;font-size:13px;min-width:145px";

  const text = document.createElement("span");
  text.textContent = title;

  const input = document.createElement("input");

  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(value);

  input.style.cssText =
    "width:120px;max-width:100%;padding:8px;" +
    "background:#152033;color:#e2e8f0;" +
    "border:1px solid #64748b;border-radius:7px";

  label.append(text, input);

  return { label, input };
}

const bitsSetting = numberSetting(
  "Битность ID (1–16)",
  6,
  1,
  16
);

const countSetting = numberSetting(
  "Количество узлов",
  10,
  1,
  100
);

const kSetting = numberSetting(
  "k — размер bucket",
  3,
  1,
  64
);

const alphaSetting = numberSetting(
  "α — запросов за раунд",
  2,
  1,
  3
);

const rangeHint = document.createElement("span");

rangeHint.style.cssText =
  "font-size:12px;color:#94a3b8;align-self:center";

const networkPanel = document.createElement("div");

networkPanel.style.cssText =
  "display:flex;align-items:end;gap:14px;flex-wrap:wrap;" +
  "padding:10px 0;margin-top:8px";

networkPanel.append(
  bitsSetting.label,
  countSetting.label,
  rangeHint
);

ui.algorithm.insertAdjacentElement(
  "afterend",
  networkPanel
);

const kademliaPanel = document.createElement("div");

kademliaPanel.style.cssText =
  "display:flex;gap:18px;flex-wrap:wrap;padding:12px;" +
  "border:1px solid #354158;border-radius:10px;margin-top:6px";

kademliaPanel.append(
  kSetting.label,
  alphaSetting.label
);

networkPanel.insertAdjacentElement(
  "afterend",
  kademliaPanel
);

function updateControls() {
  const maxCount = Math.min(
    MAX_RANDOM_NODES,
    idSpace()
  );

  countSetting.input.max = String(maxCount);

  if (
    Number(countSetting.input.value) > maxCount
  ) {
    countSetting.input.value = String(maxCount);
  }

  rangeHint.textContent =
    `ID: 0–${maxID()} · максимум ${maxCount} узлов для генерации`;

  ui.startNode.min = "0";
  ui.startNode.max = String(maxID());

  ui.target.min = "0";
  ui.target.max = String(maxID());

  ui.ids.placeholder =
    `ID узлов от 0 до ${maxID()} через запятую`;

  alphaSetting.input.max = kSetting.input.value;

  kademliaPanel.style.display =
    ui.algorithm.value === "kademlia"
      ? "flex"
      : "none";
}

function readNodeCount() {
  const raw = countSetting.input.value.trim();
  const count = Number(raw);

  const limit = Math.min(
    MAX_RANDOM_NODES,
    idSpace()
  );

  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > limit
  ) {
    throw new Error(
      `Количество узлов: целое число от 1 до ${limit}.`
    );
  }

  return count;
}

// Равномерное распределение ID при смене битности.
function evenlySpacedIDs(count) {
  return Array.from(
    { length: count },
    (_, i) => Math.floor(i * idSpace() / count)
  );
}

function changeBits() {
  const raw = bitsSetting.input.value.trim();
  const bits = Number(raw);

  if (
    !/^\d+$/.test(raw) ||
    !Number.isInteger(bits) ||
    bits < MIN_BITS ||
    bits > MAX_BITS
  ) {
    bitsSetting.input.value = String(state.bits);

    message(
      "Битность должна быть целым числом от 1 до 16."
    );

    return false;
  }

  if (bits === state.bits) {
    return true;
  }

  state.bits = bits;

  updateControls();

  // При смене битности создаём сеть с выбранным
  // количеством узлов в новом пространстве ID.
  let count;

  try {
    count = readNodeCount();
  } catch {
    count = Math.min(10, idSpace());
    countSetting.input.value = String(count);
  }

  state.ids = evenlySpacedIDs(count);

  ui.ids.value = state.ids.join(", ");

  ui.startNode.value = String(
    state.ids[Math.min(1, count - 1)]
  );

  ui.target.value = String(
    Math.round(maxID() * 0.85)
  );

  reset(
    `Выбрано ${bits} бит. Создана сеть из ${count} узлов.`
  );

  return true;
}

// --------------------------------------
// Ввод и состояние
// --------------------------------------

function parseIDs() {
  const raw = ui.ids.value.trim();

  if (!raw) {
    throw new Error("Введите ID узлов.");
  }

  const parts = raw.split(/[,;\s]+/);

  if (
    parts.some(part => !/^\d+$/.test(part))
  ) {
    throw new Error(
      "ID должны быть целыми неотрицательными числами."
    );
  }

  const ids = parts.map(Number);

  if (
    ids.some(
      id =>
        !Number.isSafeInteger(id) ||
        id > maxID()
    )
  ) {
    throw new Error(
      `При ${state.bits} битах допустимые ID: 0–${maxID()}.`
    );
  }

  if (
    new Set(ids).size !== ids.length
  ) {
    throw new Error(
      "ID узлов не должны повторяться."
    );
  }

  return ids.sort((a, b) => a - b);
}

function readID(input, label) {
  const raw = input.value.trim();
  const id = Number(raw);

  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(id) ||
    id > maxID()
  ) {
    throw new Error(
      `${label}: укажите целое число от 0 до ${maxID()}.`
    );
  }

  return id;
}

function optionalID(input) {
  try {
    return readID(input, "ID");
  } catch {
    return null;
  }
}

function message(
  description,
  result = "Поиск ещё не выполнялся."
) {
  ui.description.textContent = description;
  ui.result.textContent = result;
}

function updateButtons() {
  const count =
    state.lookup?.steps?.length ?? 0;

  ui.start.disabled = state.loading;

  ui.prev.disabled =
    state.loading ||
    !state.lookup ||
    state.index < 0;

  ui.next.disabled =
    state.loading ||
    !state.lookup ||
    state.index >= count - 1;
}

function reset(
  description = "Сеть готова. Начните поиск."
) {
  state.version++;

  state.controller?.abort();

  state.controller = null;
  state.loading = false;
  state.lookup = null;
  state.algorithm = null;
  state.index = -1;

  ui.steps.replaceChildren();

  ui.hops.textContent = "0";
  ui.requests.textContent = "—";
  ui.rounds.textContent = "—";

  message(description);

  render();
}

// --------------------------------------
// HTML-таблицы узлов
// --------------------------------------

function makeTable(headings, rows) {
  const table = document.createElement("table");
  table.style.width = "100%";

  const thead = document.createElement("thead");
  const header = document.createElement("tr");

  for (const value of headings) {
    const th = document.createElement("th");

    th.textContent = value;
    header.appendChild(th);
  }

  thead.appendChild(header);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const values of rows) {
    const tr = document.createElement("tr");

    for (const value of values) {
      const td = document.createElement("td");

      td.textContent = String(value);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);

  return table;
}

// --------------------------------------
// Таблицы текущих узлов
// --------------------------------------

function showTable() {
  ui.table.replaceChildren();

  if (!state.lookup) {
    ui.table.textContent =
      "Запустите поиск, чтобы увидеть таблицы узлов.";

    return;
  }

  // Chord — Finger Table текущего узла.
  if (state.algorithm === "chord") {
    const id = state.index < 0
      ? state.lookup.route[0]
      : state.lookup.steps[state.index].to_id;

    const h3 = document.createElement("h3");

    h3.textContent = `Finger Table узла ${id}`;

    ui.table.appendChild(h3);

    const entries =
      state.lookup.finger_tables?.[String(id)];

    if (!Array.isArray(entries)) {
      ui.table.append(
        "Поле finger_tables отсутствует в ответе Go."
      );

      return;
    }

    ui.table.appendChild(
      makeTable(
        ["i", "Start", "Finger Node"],
        entries.map((entry, i) => [
          i,
          entry.start,
          entry.node_id,
        ])
      )
    );

    return;
  }

  // Kademlia — показываем buckets всех узлов,
  // которые спрашивали в текущем раунде.
  const step = state.index >= 0
    ? state.lookup.steps[state.index]
    : null;

  const peers = step?.queried ??
    [state.lookup.start_node];

  const h3 = document.createElement("h3");

  h3.textContent = step
    ? `k-buckets узлов раунда ${step.round}: ${peers.join(", ")}`
    : `k-buckets стартового узла ${state.lookup.start_node}`;

  ui.table.appendChild(h3);

  peers.forEach((id, i) => {
    const buckets =
      state.lookup.buckets?.[String(id)];

    if (!Array.isArray(buckets)) {
      return;
    }

    const details =
      document.createElement("details");

    details.open =
      peers.length <= 3 || i === 0;

    details.style.cssText =
      "margin:10px 0;padding:9px 12px;" +
      "border:1px solid #354158;border-radius:8px";

    const summary =
      document.createElement("summary");

    summary.textContent = `Узел ${id}`;

    summary.style.cssText =
      "cursor:pointer;font-weight:600;margin-bottom:8px";

    details.appendChild(summary);

    details.appendChild(
      makeTable(
        [
          "Bucket",
          "XOR-расстояния",
          "Контакты",
        ],
        buckets.map((bucket, j) => [
          j,
          `${2 ** j}–${2 ** (j + 1) - 1}`,
          bucket.length
            ? bucket.join(", ")
            : "—",
        ])
      )
    );

    ui.table.appendChild(details);
  });
}

// --------------------------------------
// SVG: общие функции
// --------------------------------------

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(
    SVG_NS,
    tag
  );

  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(
      name,
      String(value)
    );
  }

  if (text !== undefined) {
    el.textContent = String(text);
  }

  ui.svg.appendChild(el);

  return el;
}

function addSVGTitle(element, text) {
  const title = document.createElementNS(
    SVG_NS,
    "title"
  );

  title.textContent = text;
  element.appendChild(title);
}

function ringPoint(id, radius = 145) {
  const angle =
    id * 2 * Math.PI / idSpace() -
    Math.PI / 2;

  return [
    400 + radius * Math.cos(angle),
    220 + radius * Math.sin(angle),
  ];
}

// --------------------------------------
// Chord: кольцо, маршрут, Finger Table
// --------------------------------------

function drawChord() {
  svg("circle", {
    cx: 400,
    cy: 220,
    r: 145,
    fill: "none",
    stroke: "#506078",
    "stroke-width": 2,
  });

  svg("text", {
    x: 400,
    y: 208,
    "text-anchor": "middle",
    fill: "#e2e8f0",
    "font-size": 19,
  }, "CHORD");

  svg("text", {
    x: 400,
    y: 234,
    "text-anchor": "middle",
    fill: "#94a3b8",
    "font-size": 12,
  }, `${state.bits} бит · ID 0–${maxID()} · узлов ${state.ids.length}`);

  // На кольце рисуем не больше восьми отметок.
  const tickCount = Math.min(
    8,
    idSpace()
  );

  for (let i = 0; i < tickCount; i++) {
    const id = Math.floor(
      i * idSpace() / tickCount
    );

    const [x, y] = ringPoint(id, 185);

    svg("text", {
      x,
      y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: "#94a3b8",
      "font-size": 11,
    }, id);
  }

  const target = optionalID(ui.target);

  if (target !== null) {
    const [cx, cy] = ringPoint(target);

    svg("circle", {
      cx,
      cy,
      r: 13,
      fill: "none",
      stroke: "#f6ad55",
      "stroke-dasharray": "4 3",
      "stroke-width": 2,
    });
  }

  // Настоящий маршрут, полученный от Go.
  const shown =
    state.algorithm === "chord" &&
    state.lookup
      ? state.lookup.steps.slice(
          0,
          state.index + 1
        )
      : [];

  shown.forEach((step, i) => {
    if (step.from_id === step.to_id) {
      return;
    }

    const [x1, y1] =
      ringPoint(step.from_id);

    const [x2, y2] =
      ringPoint(step.to_id);

    svg("line", {
      x1,
      y1,
      x2,
      y2,
      stroke:
        i === shown.length - 1
          ? "#38bdf8"
          : "#64748b",
      "stroke-width": 3,
    });
  });

  const active = shown.length
    ? shown[shown.length - 1].to_id
    : optionalID(ui.startNode);

  const done =
    state.algorithm === "chord" &&
    state.lookup &&
    state.index ===
      state.lookup.steps.length - 1;

  for (const id of state.ids) {
    const [cx, cy] = ringPoint(id);

    const owner =
      done &&
      id === state.lookup.owner_id;

    const color = owner
      ? "#68d391"
      : id === active
        ? "#38bdf8"
        : "#94a3b8";

    const circle = svg("circle", {
      cx,
      cy,
      r: id === active ? 10 : 6,
      fill: color,
      stroke: "#e2e8f0",
      "stroke-width": 1,
    });

    addSVGTitle(
      circle,
      `Узел ${id}${owner ? " — владелец ключа" : ""}`
    );

    // Когда узлов много, показываем подписи
    // только важных узлов, иначе текст налезает.
    if (
      state.ids.length <= 28 ||
      id === active ||
      owner
    ) {
      const [x, y] = ringPoint(id, 169);

      svg("text", {
        x,
        y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: color,
        "font-size":
          state.ids.length > 28 ? 11 : 12,
      }, id);
    }
  }

  svg("text", {
    x: 20,
    y: 420,
    fill: "#94a3b8",
    "font-size": 12,
  }, "Синий — текущий узел · зелёный — владелец · наведи на узел для ID");
}

// --------------------------------------
// Kademlia: XOR и параллельные раунды
// --------------------------------------

function drawKademlia() {
  const target = optionalID(ui.target);
  const start = optionalID(ui.startNode);

  svg("text", {
    x: 22,
    y: 32,
    fill: "#e2e8f0",
    "font-size": 18,
  }, "KADEMLIA · XOR DISTANCE");

  if (target === null) {
    return;
  }

  // Текущий раунд.
  const current =
    state.algorithm === "kademlia" &&
    state.index >= 0
      ? state.lookup.steps[state.index]
      : null;

  const history =
    state.algorithm === "kademlia"
      ? state.lookup?.steps.slice(
          0,
          state.index + 1
        ) ?? []
      : [];

  const active = new Set(
    current?.queried ?? []
  );

  const previous = new Set(
    history
      .slice(0, -1)
      .flatMap(s => s.queried)
  );

  const closest = new Set(
    current?.closest ?? []
  );

  const originID =
    state.lookup?.start_node ?? start;

  svg("text", {
    x: 22,
    y: 56,
    fill: "#93c5fd",
    "font-size": 13,
  }, current
    ? `РАУНД ${current.round}: FIND_NODE(${target}) → [${current.queried.join(", ")}]`
    : `Стартовый узел ${originID} · ${state.bits} бит · узлов ${state.ids.length}`
  );

  const left = 70;
  const width = 660;
  const axisY = 335;

  const distanceX = d =>
    left + d * width / maxID();

  svg("line", {
    x1: left,
    y1: axisY,
    x2: left + width,
    y2: axisY,
    stroke: "#94a3b8",
  });

  // Не больше девяти делений XOR-шкалы.
  const ticks = new Set(
    Array.from(
      { length: 9 },
      (_, i) => Math.round(i * maxID() / 8)
    )
  );

  ticks.forEach(d => {
    const x = distanceX(d);

    svg("line", {
      x1: x,
      y1: axisY - 5,
      x2: x,
      y2: axisY + 5,
      stroke: "#94a3b8",
    });

    svg("text", {
      x,
      y: axisY + 22,
      "text-anchor": "middle",
      fill: "#94a3b8",
      "font-size": 11,
    }, d);
  });

  svg("text", {
    x: left,
    y: 85,
    fill: "#f6ad55",
    "font-size": 12,
  }, `Цель ${target} · XOR 0`);

  const positions = new Map();

  const lanes = [
    -Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];

  // XOR используется здесь для координат SVG.
  // Сам алгоритм поиска работает на Go.
  state.ids
    .map(id => ({
      id,
      distance: id ^ target,
    }))
    .sort(
      (a, b) => a.distance - b.distance
    )
    .forEach(({ id, distance }) => {
      const x = distanceX(distance);

      let lane = lanes.findIndex(
        previousX => x - previousX >= 48
      );

      if (lane < 0) {
        lane = lanes.indexOf(
          Math.min(...lanes)
        );
      }

      lanes[lane] = x;

      positions.set(id, {
        x,
        y: 127 + lane * 51,
        distance,
      });
    });

  // Показываем обращения ко всем узлам
  // текущего логически параллельного раунда.
  const origin = positions.get(originID);

  if (origin && current) {
    for (const id of current.queried) {
      const to = positions.get(id);

      if (!to) {
        continue;
      }

      svg("line", {
        x1: origin.x,
        y1: origin.y,
        x2: to.x,
        y2: to.y,
        stroke: "#38bdf8",
        "stroke-width": 2.5,
        "stroke-dasharray": "6 5",
        opacity: 0.7,
      });
    }
  }

  for (const id of state.ids) {
    const {
      x,
      y,
      distance,
    } = positions.get(id);

    const color = active.has(id)
      ? "#38bdf8"
      : closest.has(id)
        ? "#68d391"
        : previous.has(id)
          ? "#64748b"
          : id === originID
            ? "#f59e0b"
            : "#94a3b8";

    svg("line", {
      x1: x,
      y1: y + 10,
      x2: x,
      y2: axisY,
      stroke: color,
      opacity: 0.45,
    });

    const circle = svg("circle", {
      cx: x,
      cy: y,
      r: active.has(id) ? 10 : 7,
      fill: color,
      stroke: "#e2e8f0",
    });

    addSVGTitle(
      circle,
      `Узел ${id}; XOR до ${target} = ${distance}`
    );

    const important =
      active.has(id) ||
      closest.has(id) ||
      id === originID;

    // При большом количестве узлов
    // оставляем только важные подписи.
    if (
      state.ids.length <= 25 ||
      important
    ) {
      svg("text", {
        x,
        y: y - 14,
        "text-anchor": "middle",
        fill: color,
        "font-size": 12,
        "font-weight":
          active.has(id) ? 700 : 400,
      }, id);

      if (state.ids.length <= 25) {
        svg("text", {
          x,
          y: y + 25,
          "text-anchor": "middle",
          fill: "#94a3b8",
          "font-size": 10,
        }, `d=${distance}`);
      }
    }
  }

  svg("text", {
    x: 22,
    y: 415,
    fill: "#94a3b8",
    "font-size": 12,
  }, "Синий — запросы раунда · зелёный — shortlist · оранжевый — старт");
}

// --------------------------------------
// Общая отрисовка
// --------------------------------------

function render() {
  ui.svg.replaceChildren();

  ui.svg.setAttribute(
    "viewBox",
    "0 0 800 440"
  );

  if (ui.algorithm.value === "kademlia") {
    drawKademlia();
  } else {
    drawChord();
  }

  showTable();
  updateButtons();
}

// --------------------------------------
// Отображение раундов Kademlia
// --------------------------------------

function makeRoundItem(step, selected) {
  const li = document.createElement("li");

  li.style.cssText =
    `padding:12px;margin:8px 0;border:1px solid ${
      selected ? "#38bdf8" : "#354158"
    };border-radius:9px;list-style:none`;

  const heading = document.createElement("strong");

  heading.textContent =
    `Раунд ${step.round} · спросили: ${step.queried.join(", ")}`;

  li.appendChild(heading);

  for (const reply of step.replies) {
    const line = document.createElement("div");

    line.style.cssText =
      "margin-top:6px;color:#cbd5e1;font-size:13px";

    line.textContent =
      `Узел ${reply.peer_id} → [${reply.returned.join(", ") || "пусто"}]`;

    li.appendChild(line);
  }

  const shortlist = document.createElement("div");

  shortlist.style.cssText =
    "margin-top:8px;color:#86efac;font-size:13px";

  shortlist.textContent =
    `Shortlist после раунда: [${step.closest.join(", ")}]`;

  li.appendChild(shortlist);

  return li;
}

// --------------------------------------
// Пошаговый просмотр
// --------------------------------------

function showStep() {
  ui.steps.replaceChildren();

  if (!state.lookup) {
    return render();
  }

  const steps = state.lookup.steps;

  if (
    steps.length === 0 &&
    state.algorithm === "kademlia"
  ) {
    message(
      "Запросы не потребовались.",
      `Ближайшие узлы: ${state.lookup.closest_nodes.join(", ")}.`
    );

    ui.hops.textContent = "—";
    ui.requests.textContent = "0";
    ui.rounds.textContent = "0";

    return render();
  }

  if (state.index < 0) {
    message(
      "Go выполнил поиск. Нажмите «Следующий шаг».",
      "Результат готов к просмотру."
    );

    ui.hops.textContent =
      state.algorithm === "chord" ? "0" : "—";

    ui.requests.textContent =
      state.algorithm === "kademlia" ? "0" : "—";

    ui.rounds.textContent =
      state.algorithm === "kademlia" ? "0" : "—";

    return render();
  }

  steps
    .slice(0, state.index + 1)
    .forEach((step, i) => {
      if (state.algorithm === "kademlia") {
        ui.steps.appendChild(
          makeRoundItem(
            step,
            i === state.index
          )
        );
      } else {
        const li = document.createElement("li");

        li.textContent = step.description;

        if (i === state.index) {
          li.classList.add("active");
        }

        ui.steps.appendChild(li);
      }
    });

  const step = steps[state.index];

  const done =
    state.index === steps.length - 1;

  if (state.algorithm === "chord") {
    const traversed = steps
      .slice(0, state.index + 1)
      .filter(
        s => s.from_id !== s.to_id
      ).length;

    ui.description.textContent =
      `Шаг ${state.index + 1}/${steps.length}: ${step.description}`;

    ui.hops.textContent = String(
      done ? state.lookup.hops : traversed
    );

    ui.requests.textContent = "—";
    ui.rounds.textContent = "—";

    ui.result.textContent = done
      ? `Владелец ключа ${state.lookup.target_id}: ${state.lookup.owner_id}. ` +
        `Маршрут: ${state.lookup.route.join(" → ")}.`
      : `Пройдено переходов: ${traversed}.`;

  } else {
    // Один шаг Kademlia = один целый раунд.
    ui.description.textContent =
      `Раунд ${step.round}/${steps.length}: спросили ${step.queried.join(", ")}.`;

    ui.hops.textContent = "—";

    ui.requests.textContent =
      String(step.requests);

    ui.rounds.textContent =
      String(step.round);

    ui.result.textContent = done
      ? (
          state.lookup.exact_match
            ? "Точный ID найден. "
            : "Точного совпадения нет. "
        ) +
        `Ближайшие узлы: ${state.lookup.closest_nodes.join(", ")}. ` +
        `Запросов: ${state.lookup.requests}, раундов: ${state.lookup.rounds}.`

      : `Опрошено в раунде: ${step.queried.length}. ` +
        `Ближайшие известные: ${step.closest.join(", ")}.`;
  }

  render();
}

// --------------------------------------
// Проверка ответа Go
// --------------------------------------

function validateReply(payload, algorithm) {
  const result = payload?.[algorithm];

  if (
    payload?.algorithm !== algorithm ||
    !result ||
    !Array.isArray(result.steps)
  ) {
    throw new Error(
      "Go вернул неверный формат JSON."
    );
  }

  if (
    algorithm === "chord" &&
    !Array.isArray(result.route)
  ) {
    throw new Error(
      "В ответе отсутствует маршрут Chord."
    );
  }

  if (
    algorithm === "kademlia" &&
    (
      !Array.isArray(result.closest_nodes) ||
      !result.buckets ||
      result.steps.some(step =>
        !Array.isArray(step.queried) ||
        !Array.isArray(step.replies) ||
        !Array.isArray(step.closest)
      )
    )
  ) {
    throw new Error(
      "Неверный формат раундов Kademlia: обновите kademlia.go."
    );
  }

  return result;
}

// --------------------------------------
// HTTP API
// --------------------------------------

async function start() {
  if (!changeBits()) {
    return;
  }

  let ids;
  let startID;
  let targetID;

  try {
    ids = parseIDs();

    startID = readID(
      ui.startNode,
      "Начальный узел"
    );

    targetID = readID(
      ui.target,
      "Целевой ID"
    );

    if (!ids.includes(startID)) {
      throw new Error(
        "Стартового узла нет в сети."
      );
    }

  } catch (error) {
    reset(error.message);
    return;
  }

  state.ids = ids;
  reset();

  const algorithm = ui.algorithm.value;

  const body = {
    algorithm,
    bits: state.bits,
    nodes: ids,
    start_node: startID,
    target_id: targetID,
  };

  if (algorithm === "kademlia") {
    body.k = Number(kSetting.input.value);
    body.alpha = Number(alphaSetting.input.value);

    if (
      !Number.isInteger(body.k) ||
      body.k < 1 ||
      body.k > 64 ||
      !Number.isInteger(body.alpha) ||
      body.alpha < 1 ||
      body.alpha > body.k
    ) {
      message(
        "Укажите k от 1 до 64 и α от 1 до k."
      );

      return;
    }
  }

  const version = ++state.version;
  const controller = new AbortController();

  state.controller = controller;
  state.loading = true;

  updateButtons();

  message(
    `Go выполняет поиск ${algorithm} (${state.bits} бит)...`,
    "Ожидается ответ API."
  );

  try {
    const response = await fetch(
      "/api/lookup",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(body),

        signal: controller.signal,
      }
    );

    const type =
      response.headers.get("content-type") ?? "";

    const payload =
      type.includes("application/json")
        ? await response.json()
        : await response.text();

    if (version !== state.version) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        typeof payload === "string"
          ? payload.trim()
          : payload?.error ||
              `HTTP ${response.status}`
      );
    }

    state.lookup = validateReply(
      payload,
      algorithm
    );

    state.algorithm = algorithm;
    state.index = -1;

    showStep();

  } catch (error) {
    if (
      version !== state.version ||
      error.name === "AbortError"
    ) {
      return;
    }

    state.lookup = null;

    message(
      `Ошибка: ${error.message}`,
      "Поиск не выполнен."
    );

    render();

  } finally {
    if (version === state.version) {
      state.loading = false;
      state.controller = null;

      updateButtons();
    }
  }
}

// --------------------------------------
// События интерфейса
// --------------------------------------

// Создать сеть из введённых ID.
ui.create.addEventListener("click", () => {
  if (!changeBits()) {
    return;
  }

  try {
    state.ids = parseIDs();

    ui.ids.value = state.ids.join(", ");

    reset(
      `Сеть создана: ${state.ids.length} узлов.`
    );

  } catch (error) {
    reset(error.message);
  }
});

// Создать случайную сеть с выбранным числом узлов.
ui.random.addEventListener("click", () => {
  if (!changeBits()) {
    return;
  }

  let count;

  try {
    count = readNodeCount();
  } catch (error) {
    message(error.message);
    return;
  }

  const unique = new Set();

  // Продолжаем, пока не получим ровно count
  // уникальных ID из пространства 0–2^bits-1.
  while (unique.size < count) {
    unique.add(
      Math.floor(Math.random() * idSpace())
    );
  }

  state.ids = [...unique].sort(
    (a, b) => a - b
  );

  ui.ids.value = state.ids.join(", ");

  ui.startNode.value = String(
    state.ids[0]
  );

  reset(
    `Сгенерировано ${count} узлов (${state.bits} бит).`
  );
});

// Начать поиск.
ui.start.addEventListener(
  "click",
  start
);

// Предыдущий шаг / раунд.
ui.prev.addEventListener("click", () => {
  if (
    state.lookup &&
    state.index >= 0
  ) {
    state.index--;
    showStep();
  }
});

// Следующий шаг / раунд.
ui.next.addEventListener("click", () => {
  if (
    state.lookup &&
    state.index <
      state.lookup.steps.length - 1
  ) {
    state.index++;
    showStep();
  }
});

// Сброс.
ui.reset.addEventListener("click", () => {
  reset("Симуляция сброшена.");
});

// Выбор алгоритма.
ui.algorithm.addEventListener(
  "change",
  () => {
    updateControls();
    reset("Алгоритм изменён.");
  }
);

// Изменение битности.
bitsSetting.input.addEventListener(
  "change",
  changeBits
);

// Количество узлов влияет на следующую генерацию,
// но не меняет уже созданную сеть.
countSetting.input.addEventListener(
  "change",
  () => {
    try {
      readNodeCount();
    } catch (error) {
      message(error.message);
    }
  }
);

// Изменение ID или alpha сбрасывает поиск.
for (const input of [
  ui.ids,
  ui.startNode,
  ui.target,
  alphaSetting.input,
]) {
  input.addEventListener("input", () => {
    reset(
      "Параметры изменены. Начните поиск заново."
    );
  });
}

// При изменении k обновляем допустимое alpha.
kSetting.input.addEventListener(
  "input",
  () => {
    alphaSetting.input.max =
      kSetting.input.value;

    if (
      Number(alphaSetting.input.value) >
      Number(kSetting.input.value)
    ) {
      alphaSetting.input.value =
        kSetting.input.value;
    }

    reset(
      "Параметры Kademlia изменены."
    );
  }
);

// --------------------------------------
// Инициализация
// --------------------------------------

try {
  state.ids = parseIDs();
} catch {
  state.ids = [...DEFAULT_IDS];

  ui.ids.value =
    DEFAULT_IDS.join(", ");
}

updateControls();
reset();
