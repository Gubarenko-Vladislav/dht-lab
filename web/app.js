
"use strict";

// Вся маршрутизация Chord выполняется на Go.
// Здесь только ввод параметров, запрос к API и визуализация полученных шагов.
const SVG_NS = "http://www.w3.org/2000/svg";
const BITS = 6;
const ID_SPACE = 1 << BITS;
const DEFAULT_NODES = [4, 8, 14, 21, 32, 38, 42, 48, 51, 56];

const ui = {
    nodeIds: document.getElementById("node-ids"),
    createNetwork: document.getElementById("create-network"),
    randomNetwork: document.getElementById("random-network"),
    svg: document.getElementById("network-svg"),
    algorithm: document.getElementById("algorithm"),
    startNode: document.getElementById("start-node"),
    targetId: document.getElementById("target-id"),
    start: document.getElementById("start-btn"),
    prev: document.getElementById("prev-btn"),
    next: document.getElementById("next-btn"),
    reset: document.getElementById("reset-btn"),
    routing: document.getElementById("routing-table"),
    description: document.getElementById("step-description"),
    steps: document.getElementById("steps-list"),
    result: document.getElementById("search-result"),
    hops: document.getElementById("hops-count"),
    requests: document.getElementById("requests-count"),
    rounds: document.getElementById("rounds-count"),
};

const state = {
    nodes: [...DEFAULT_NODES],
    lookup: null,
    stepIndex: -1, // -1: ни один шаг ещё не показан.
    loading: false,
    controller: null,
    requestVersion: 0,
};

// --------------------------------------------------
// Вспомогательные функции
// --------------------------------------------------

function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);

    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, String(value));
    }

    return element;
}

function svgText(parent, x, y, value, attrs = {}) {
    const element = svgElement("text", { x, y, ...attrs });
    element.textContent = String(value);
    parent.appendChild(element);
    return element;
}

function svgLine(parent, x1, y1, x2, y2, attrs = {}) {
    const element = svgElement("line", {
        x1,
        y1,
        x2,
        y2,
        ...attrs,
    });

    parent.appendChild(element);
    return element;
}

function parseNodeIds(input) {
    const parts = input.split(",").map(value => value.trim());

    if (parts.length === 0 || parts.some(value => value === "")) {
        throw new Error("Введите ID узлов через запятую.");
    }

    const ids = parts.map(value => {
        if (!/^\d+$/.test(value)) {
            throw new Error(`Некорректный ID узла: ${value}`);
        }

        const id = Number(value);

        if (!Number.isSafeInteger(id) || id < 0 || id >= ID_SPACE) {
            throw new Error(
                `ID узлов должны находиться в диапазоне 0–${ID_SPACE - 1}.`
            );
        }

        return id;
    });

    if (new Set(ids).size !== ids.length) {
        throw new Error("ID узлов не должны повторяться.");
    }

    return ids.sort((a, b) => a - b);
}

function readId(input, name) {
    const raw = input.value.trim();
    const id = Number(raw);

    if (
        raw === "" ||
        !Number.isInteger(id) ||
        id < 0 ||
        id >= ID_SPACE
    ) {
        throw new Error(
            `${name}: укажите целое число от 0 до ${ID_SPACE - 1}.`
        );
    }

    return id;
}

function optionalId(input) {
    try {
        return readId(input, "ID");
    } catch {
        return null;
    }
}

function showMessage(description, result = null) {
    ui.description.textContent = description;

    if (result !== null) {
        ui.result.textContent = result;
    }
}

function updateButtons() {
    const steps = state.lookup?.steps ?? [];

    ui.start.disabled = state.loading;

    ui.prev.disabled =
        state.loading ||
        !state.lookup ||
        state.stepIndex < 0;

    ui.next.disabled =
        state.loading ||
        !state.lookup ||
        state.stepIndex >= steps.length - 1;
}

function cancelRequest() {
    state.requestVersion++;

    if (state.controller) {
        state.controller.abort();
    }

    state.controller = null;
    state.loading = false;
}

function clearSimulation(
    description = "Сеть готова. Выберите алгоритм и параметры поиска."
) {
    cancelRequest();

    state.lookup = null;
    state.stepIndex = -1;

    ui.steps.replaceChildren();

    ui.hops.textContent = "0";

    // Эти метрики сервер пока не возвращает.
    ui.requests.textContent = "—";
    ui.rounds.textContent = "—";

    showMessage(description, "Поиск ещё не выполнялся.");

    renderRouting();
    renderNetwork();
    updateButtons();
}

// --------------------------------------------------
// Таблица маршрутизации
// --------------------------------------------------

function renderRouting() {
    ui.routing.replaceChildren();

    const note = document.createElement("p");

    if (ui.algorithm.value === "kademlia") {
        note.textContent =
            "k-buckets появятся после реализации Kademlia на Go.";
    } else if (!state.lookup || state.stepIndex < 0) {
        note.textContent =
            "Finger Table пока не передаётся через Go API. " +
            "После запуска поиска здесь будут видны решения маршрутизации.";
    } else {
        note.textContent =
            "Выполненные решения Chord (это ещё не полная Finger Table):";
    }

    ui.routing.appendChild(note);

    if (!state.lookup || state.stepIndex < 0) {
        return;
    }

    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");

    for (const title of ["От узла", "К узлу", "Действие"]) {
        const cell = document.createElement("th");
        cell.textContent = title;
        headerRow.appendChild(cell);
    }

    head.appendChild(headerRow);
    table.appendChild(head);

    const body = document.createElement("tbody");

    for (
        const step of state.lookup.steps.slice(0, state.stepIndex + 1)
    ) {
        const row = document.createElement("tr");

        for (const value of [
            step.from_id,
            step.to_id,
            step.action,
        ]) {
            const cell = document.createElement("td");
            cell.textContent = String(value);
            row.appendChild(cell);
        }

        body.appendChild(row);
    }

    table.appendChild(body);
    ui.routing.appendChild(table);
}

// --------------------------------------------------
// CHORD: визуализация кольца
// --------------------------------------------------

function chordPosition(id, radius = 140) {
    const angle =
        (id / ID_SPACE) * Math.PI * 2 - Math.PI / 2;

    return {
        x: 400 + Math.cos(angle) * radius,
        y: 220 + Math.sin(angle) * radius,
    };
}

function addArrowMarkers() {
    const defs = svgElement("defs");

    for (const [id, color] of [
        ["route-previous", "#64748b"],
        ["route-active", "#63b3ed"],
    ]) {
        const marker = svgElement("marker", {
            id,
            markerWidth: 7,
            markerHeight: 7,
            refX: 6,
            refY: 3.5,
            orient: "auto",
        });

        marker.appendChild(svgElement("path", {
            d: "M0 0 L7 3.5 L0 7 Z",
            fill: color,
        }));

        defs.appendChild(marker);
    }

    ui.svg.appendChild(defs);
}

function renderChord() {
    ui.svg.replaceChildren();
    addArrowMarkers();

    // Основное кольцо.
    ui.svg.appendChild(svgElement("circle", {
        cx: 400,
        cy: 220,
        r: 140,
        fill: "none",
        stroke: "#354158",
        "stroke-width": 2,
    }));

    // Отметки ID-пространства.
    for (let id = 0; id < ID_SPACE; id++) {
        const inner = chordPosition(
            id,
            id % 8 === 0 ? 145 : 147
        );

        const outer = chordPosition(
            id,
            id % 8 === 0 ? 154 : 151
        );

        svgLine(
            ui.svg,
            inner.x,
            inner.y,
            outer.x,
            outer.y,
            {
                stroke: id % 8 === 0 ? "#8292ad" : "#354158",
                "stroke-width": id % 8 === 0 ? 1.4 : 0.8,
            }
        );
    }

    // Подписи главных делений.
    for (let id = 0; id < ID_SPACE; id += 8) {
        const p = chordPosition(id, 184);

        svgText(ui.svg, p.x, p.y, id, {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 12,
        });
    }

    // Центральная информация.
    svgText(ui.svg, 400, 205, "CHORD", {
        "text-anchor": "middle",
        "font-weight": 700,
        "font-size": 18,
    }).style.fill = "#e8eef8";

    svgText(ui.svg, 400, 226, `ID: 0–${ID_SPACE - 1}`, {
        "text-anchor": "middle",
        "font-size": 12,
    });

    svgText(ui.svg, 400, 246, `Узлов: ${state.nodes.length}`, {
        "text-anchor": "middle",
        "font-size": 12,
    });

    const target = optionalId(ui.targetId);
    const start = optionalId(ui.startNode);

    // Целевой ключ.
    if (target !== null) {
        const p = chordPosition(target);

        ui.svg.appendChild(svgElement("circle", {
            cx: p.x,
            cy: p.y,
            r: 13,
            fill: "none",
            stroke: "#f6ad55",
            "stroke-width": 2,
            "stroke-dasharray": "4 3",
        }));

        const marker = svgElement("circle", {
            cx: p.x,
            cy: p.y,
            r: 4,
            fill: "#f6ad55",
        });

        const title = svgElement("title");
        title.textContent = `Целевой ключ ${target}`;

        marker.appendChild(title);
        ui.svg.appendChild(marker);
    }

    // Берём только те шаги, которые уже показаны пользователю.
    const visibleSteps = state.lookup
        ? state.lookup.steps.slice(0, state.stepIndex + 1)
        : [];

    // Рисуем переходы, полученные от Go.
    visibleSteps.forEach((step, index) => {
        if (step.from_id === step.to_id) {
            return;
        }

        const a = chordPosition(step.from_id);
        const b = chordPosition(step.to_id);

        const dx = b.x - a.x;
        const dy = b.y - a.y;

        const distance = Math.hypot(dx, dy) || 1;
        const ux = dx / distance;
        const uy = dy / distance;

        const startX = a.x + ux * 13;
        const startY = a.y + uy * 13;

        const endX = b.x - ux * 13;
        const endY = b.y - uy * 13;

        const bend = Math.min(distance * 0.13, 35);

        const controlX =
            (startX + endX) / 2 - uy * bend;

        const controlY =
            (startY + endY) / 2 + ux * bend;

        const active = index === state.stepIndex;

        const path = svgElement("path", {
            d:
                `M ${startX} ${startY} ` +
                `Q ${controlX} ${controlY} ${endX} ${endY}`,
            fill: "none",
            stroke: active ? "#63b3ed" : "#64748b",
            "stroke-width": active ? 3.5 : 2,
            "stroke-linecap": "round",
            "marker-end": active
                ? "url(#route-active)"
                : "url(#route-previous)",
            opacity: active ? 1 : 0.7,
        });

        ui.svg.appendChild(path);
    });

    // Текущий шаг.
    const activeStep = state.stepIndex >= 0
        ? state.lookup?.steps[state.stepIndex]
        : null;

    const activeNode = activeStep
        ? activeStep.to_id
        : start;

    const atEnd =
        state.lookup &&
        state.stepIndex === state.lookup.steps.length - 1;

    // Узлы сети.
    for (const id of state.nodes) {
        const p = chordPosition(id);

        const isStart = id === start;
        const isActive = id === activeNode;

        const isOwner = Boolean(
            atEnd && id === state.lookup.owner_id
        );

        const circle = svgElement("circle", {
            cx: p.x,
            cy: p.y,
            r: isActive ? 10 : 7,
            fill: isOwner
                ? "#68d391"
                : isActive
                    ? "#63b3ed"
                    : "#8292ad",
            stroke: isActive ? "#e8f6ff" : "#a7b4c9",
            "stroke-width": isActive ? 2.5 : 1.4,
        });

        const title = svgElement("title");

        title.textContent =
            `Узел ${id}` +
            (isStart ? " — старт" : "") +
            (isOwner ? " — владелец" : "");

        circle.appendChild(title);
        ui.svg.appendChild(circle);

        // Подпись узла.
        const labelPos = chordPosition(id, 166);

        const label = svgText(
            ui.svg,
            labelPos.x,
            labelPos.y,
            id,
            {
                "text-anchor": "middle",
                "dominant-baseline": "middle",
                "font-size": 12,
                "font-weight": isActive ? 700 : 500,
            }
        );

        label.style.fill = isOwner
            ? "#68d391"
            : isActive
                ? "#63b3ed"
                : "#c4cede";
    }

    // Легенда.
    svgText(
        ui.svg,
        24,
        423,
        "● Старт / активный узел",
        { "font-size": 12 }
    ).style.fill = "#63b3ed";

    svgText(
        ui.svg,
        260,
        423,
        "◎ Целевой ключ",
        { "font-size": 12 }
    ).style.fill = "#f6ad55";

    ui.svg.setAttribute(
        "aria-label",
        `Chord: кольцо из ${state.nodes.length} узлов, ` +
        `цель ${target ?? "не задана"}`
    );
}

// --------------------------------------------------
// KADEMLIA: визуализация XOR-расстояний
// --------------------------------------------------

// Здесь только визуализация расстояний.
// Алгоритм поиска Kademlia в JavaScript не реализуется.

function renderKademlia() {
    ui.svg.replaceChildren();

    svgText(
        ui.svg,
        24,
        32,
        "KADEMLIA · XOR DISTANCE",
        {
            "font-size": 17,
            "font-weight": 700,
        }
    ).style.fill = "#e8eef8";

    svgText(
        ui.svg,
        24,
        56,
        "Визуальная карта расстояний — не маршрут поиска",
        { "font-size": 12 }
    );

    const target = optionalId(ui.targetId);
    const start = optionalId(ui.startNode);

    if (target === null) {
        svgText(
            ui.svg,
            400,
            220,
            "Укажите целевой ID",
            {
                "text-anchor": "middle",
                "font-size": 14,
            }
        );

        return;
    }

    const left = 70;
    const right = 750;
    const axisY = 330;

    const xFor = distance =>
        left +
        (distance / (ID_SPACE - 1)) * (right - left);

    // Шкала расстояний.
    svgLine(
        ui.svg,
        left,
        axisY,
        right,
        axisY,
        {
            stroke: "#71829e",
            "stroke-width": 1.5,
        }
    );

    for (
        let distance = 0;
        distance < ID_SPACE;
        distance += 8
    ) {
        const x = xFor(distance);

        svgLine(
            ui.svg,
            x,
            axisY - 6,
            x,
            axisY + 6,
            {
                stroke: "#71829e",
            }
        );

        svgText(
            ui.svg,
            x,
            axisY + 24,
            distance,
            {
                "text-anchor": "middle",
                "font-size": 11,
            }
        );
    }

    svgText(
        ui.svg,
        xFor(ID_SPACE - 1),
        axisY + 24,
        ID_SPACE - 1,
        {
            "text-anchor": "middle",
            "font-size": 11,
        }
    );

    // Цель находится на расстоянии XOR = 0.
    svgLine(
        ui.svg,
        left,
        90,
        left,
        axisY,
        {
            stroke: "#f6ad55",
            "stroke-dasharray": "5 4",
        }
    );

    svgText(
        ui.svg,
        left + 8,
        84,
        `Target ${target}`,
        {
            "font-weight": 700,
            "font-size": 12,
        }
    ).style.fill = "#f6ad55";

    // XOR используется только для размещения узлов на карте.
    const sorted = state.nodes
        .map(id => ({
            id,
            distance: id ^ target,
        }))
        .sort((a, b) => a.distance - b.distance);

    const lanes = [112, 162, 212, 262];
    const lastX = lanes.map(() => -Infinity);

    for (const item of sorted) {
        const x = xFor(item.distance);

        let lane = lastX.findIndex(
            previousX => x - previousX >= 50
        );

        if (lane === -1) {
            lane = lastX.indexOf(Math.min(...lastX));
        }

        lastX[lane] = x;

        const y = lanes[lane];
        const isStart = item.id === start;

        svgLine(
            ui.svg,
            x,
            y + 9,
            x,
            axisY - 5,
            {
                stroke: isStart ? "#63b3ed" : "#354158",
                "stroke-width": isStart ? 1.8 : 1,
            }
        );

        const node = svgElement("circle", {
            cx: x,
            cy: y,
            r: isStart ? 8 : 6,
            fill: isStart ? "#63b3ed" : "#8292ad",
            stroke: isStart ? "#e8f6ff" : "#a7b4c9",
        });

        const tooltip = svgElement("title");

        tooltip.textContent =
            `Узел ${item.id}, ` +
            `расстояние XOR: ${item.distance}`;

        node.appendChild(tooltip);
        ui.svg.appendChild(node);

        // ID узла.
        svgText(
            ui.svg,
            x,
            y - 14,
            item.id,
            {
                "text-anchor": "middle",
                "font-size": 12,
                "font-weight": isStart ? 700 : 500,
            }
        ).style.fill = isStart ? "#63b3ed" : "#c4cede";

        // XOR-расстояние.
        svgText(
            ui.svg,
            x,
            y + 22,
            `d=${item.distance}`,
            {
                "text-anchor": "middle",
                "font-size": 10,
            }
        );
    }

    svgText(
        ui.svg,
        24,
        410,
        "d = nodeID XOR targetID · Меньше d — ближе по XOR",
        { "font-size": 12 }
    );

    ui.svg.setAttribute(
        "aria-label",
        `Kademlia: XOR-расстояния ${state.nodes.length} ` +
        `узлов до ID ${target}`
    );
}

// --------------------------------------------------
// Выбор визуализации
// --------------------------------------------------

function renderNetwork() {
    if (ui.algorithm.value === "kademlia") {
        renderKademlia();
    } else {
        renderChord();
    }
}

// --------------------------------------------------
// Пошаговая визуализация результатов Go
// --------------------------------------------------

function renderSimulationStep() {
    ui.steps.replaceChildren();

    if (!state.lookup) {
        updateButtons();
        return;
    }

    const {
        steps,
        route,
        hops,
        owner_id: ownerId,
        target_id: targetId,
    } = state.lookup;

    // Результат получен, но пользователь ещё
    // не начал просматривать шаги.
    if (state.stepIndex < 0) {
        showMessage(
            `Go выполнил поиск Chord от узла ${route[0]} ` +
            `для ключа ${targetId}. ` +
            "Нажмите «Следующий шаг», чтобы начать просмотр.",
            "Маршрут пока не показан."
        );

        ui.hops.textContent = "0";
    } else {
        // Формируем список уже показанных шагов.
        for (let i = 0; i <= state.stepIndex; i++) {
            const step = steps[i];

            const li = document.createElement("li");

            li.textContent =
                `${step.from_id} → ${step.to_id} ` +
                `(${step.action}): ${step.description}`;

            if (i === state.stepIndex) {
                li.classList.add("active");
            }

            ui.steps.appendChild(li);
        }

        const currentStep = steps[state.stepIndex];

        const completed =
            state.stepIndex === steps.length - 1;

        // Количество реально показанных переходов.
        const traversed = steps
            .slice(0, state.stepIndex + 1)
            .filter(step => step.from_id !== step.to_id)
            .length;

        ui.hops.textContent = String(
            completed ? hops : traversed
        );

        ui.description.textContent =
            `Шаг ${state.stepIndex + 1} из ${steps.length}. ` +
            currentStep.description;

        if (completed) {
            ui.result.textContent =
                `Поиск завершён. ` +
                `Владелец ключа ${targetId}: узел ${ownerId}. ` +
                `Маршрут: ${route.join(" → ")}. ` +
                `Переходов: ${hops}.`;
        } else {
            ui.result.textContent =
                `Показано переходов: ${traversed}. ` +
                "Поиск продолжается.";
        }
    }

    renderRouting();
    renderNetwork();
    updateButtons();
}

// --------------------------------------------------
// Проверка результата Go API
// --------------------------------------------------

function requireLookupPayload(payload) {
    const lookup = payload?.chord;

    if (payload?.algorithm !== "chord" || !lookup) {
        throw new Error(
            "Сервер вернул неожиданный формат результата Chord."
        );
    }

    if (
        !Array.isArray(lookup.route) ||
        !Array.isArray(lookup.steps) ||
        !Number.isInteger(lookup.owner_id) ||
        !Number.isInteger(lookup.hops) ||
        !Number.isInteger(lookup.target_id) ||
        !lookup.steps.every(step =>
            Number.isInteger(step.from_id) &&
            Number.isInteger(step.to_id) &&
            typeof step.action === "string" &&
            typeof step.description === "string"
        )
    ) {
        throw new Error(
            "Ответ Go API не содержит корректный маршрут или шаги."
        );
    }

    return lookup;
}

// --------------------------------------------------
// Запуск симуляции через Go API
// --------------------------------------------------

async function startSimulation() {
    let ids;
    let startNode;
    let targetId;

    // Сначала проверяем данные пользователя.
    try {
        ids = parseNodeIds(ui.nodeIds.value);

        startNode = readId(
            ui.startNode,
            "Начальный узел"
        );

        targetId = readId(
            ui.targetId,
            "Целевой ID"
        );

        if (!ids.includes(startNode)) {
            throw new Error(
                `Начальный узел ${startNode} отсутствует в сети.`
            );
        }
    } catch (error) {
        clearSimulation(error.message);
        return;
    }

    state.nodes = ids;
    clearSimulation();

    // Kademlia пока не реализована на Go.
    if (ui.algorithm.value !== "chord") {
        showMessage(
            "Поиск Kademlia пока не реализован на Go. " +
            "Сейчас доступна только карта XOR-расстояний.",
            "Результата поиска Kademlia пока нет."
        );

        return;
    }

    // Идентификатор запроса защищает от устаревших ответов.
    const version = ++state.requestVersion;

    const controller = new AbortController();
    state.controller = controller;

    state.loading = true;
    updateButtons();

    showMessage(
        "Выполняется поиск Chord на Go...",
        "Ожидается результат HTTP API."
    );

    try {
        // Настоящий HTTP-запрос к твоему Go-бэкенду.
        const response = await fetch("/api/lookup", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                algorithm: "chord",
                bits: BITS,
                nodes: ids,
                start_node: startNode,
                target_id: targetId,
            }),

            signal: controller.signal,
        });

        const contentType =
            response.headers.get("content-type") || "";

        // Go может вернуть как JSON, так и текст ошибки.
        const data = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (version !== state.requestVersion) {
            return;
        }

        if (!response.ok) {
            const reason = typeof data === "string"
                ? data.trim()
                : data?.error || `HTTP ${response.status}`;

            throw new Error(
                reason || `HTTP ${response.status}`
            );
        }

        // Результат вычислен Go.
        state.lookup = requireLookupPayload(data);

        // Начинаем с нулевого состояния визуализации.
        state.stepIndex = -1;

        renderSimulationStep();

    } catch (error) {
        if (
            version !== state.requestVersion ||
            error.name === "AbortError"
        ) {
            return;
        }

        state.lookup = null;

        showMessage(
            `Ошибка поиска: ${error.message}`,
            "Поиск не выполнен."
        );

        renderRouting();
        renderNetwork();

    } finally {
        if (version === state.requestVersion) {
            state.controller = null;
            state.loading = false;
            updateButtons();
        }
    }
}

// --------------------------------------------------
// Создание сети
// --------------------------------------------------

function createNetwork() {
    try {
        state.nodes = parseNodeIds(ui.nodeIds.value);

        ui.nodeIds.value = state.nodes.join(", ");

        clearSimulation(
            `Создана сеть из ${state.nodes.length} узлов.`
        );

    } catch (error) {
        clearSimulation(error.message);
    }
}

// --------------------------------------------------
// Генерация случайной сети
// --------------------------------------------------

function randomNetwork() {
    const ids = new Set();

    // Генерируем 10 уникальных ID.
    while (ids.size < 10) {
        ids.add(
            Math.floor(Math.random() * ID_SPACE)
        );
    }

    state.nodes = [...ids].sort((a, b) => a - b);

    ui.nodeIds.value = state.nodes.join(", ");

    // Выбираем существующий стартовый узел.
    const randomIndex = Math.floor(
        Math.random() * state.nodes.length
    );

    ui.startNode.value = String(
        state.nodes[randomIndex]
    );

    clearSimulation(
        `Сгенерирована сеть из ${state.nodes.length} узлов.`
    );
}

// --------------------------------------------------
// Обработчики событий
// --------------------------------------------------

// Создать сеть.
ui.createNetwork.addEventListener(
    "click",
    createNetwork
);

// Случайная сеть.
ui.randomNetwork.addEventListener(
    "click",
    randomNetwork
);

// Начать поиск.
ui.start.addEventListener(
    "click",
    startSimulation
);

// Сбросить симуляцию.
ui.reset.addEventListener("click", () => {
    clearSimulation(
        "Симуляция сброшена. Сеть и параметры сохранены."
    );
});

// Шаг назад.
ui.prev.addEventListener("click", () => {
    if (
        state.lookup &&
        state.stepIndex >= 0
    ) {
        state.stepIndex--;
        renderSimulationStep();
    }
});

// Следующий шаг.
ui.next.addEventListener("click", () => {
    if (
        state.lookup &&
        state.stepIndex < state.lookup.steps.length - 1
    ) {
        state.stepIndex++;
        renderSimulationStep();
    }
});

// Смена алгоритма.
ui.algorithm.addEventListener("change", () => {
    clearSimulation(
        "Алгоритм изменён. Начните новый поиск."
    );
});

// Изменение стартового узла.
ui.startNode.addEventListener("input", () => {
    clearSimulation(
        "Начальный узел изменён. Начните новый поиск."
    );
});

// Изменение целевого ID.
ui.targetId.addEventListener("input", () => {
    clearSimulation(
        "Целевой ID изменён. Начните новый поиск."
    );
});

// Изменение списка узлов.
ui.nodeIds.addEventListener("input", () => {
    clearSimulation(
        "Список ID изменён. " +
        "Нажмите «Создать сеть» или «Начать»."
    );
});

// --------------------------------------------------
// Инициализация приложения
// --------------------------------------------------

try {
    state.nodes = parseNodeIds(ui.nodeIds.value);
} catch {
    state.nodes = [...DEFAULT_NODES];
    ui.nodeIds.value = DEFAULT_NODES.join(", ");
}

clearSimulation();
