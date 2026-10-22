
"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const ID_MIN = 0;
const ID_MAX = 63;
const DEFAULT_NODES = [4, 8, 14, 21, 32, 38, 42, 48, 51, 56];

// DOM-элементы
const nodeIdsInput = document.getElementById("node-ids");
const createNetworkBtn = document.getElementById("create-network");
const randomNetworkBtn = document.getElementById("random-network");
const networkSvg = document.getElementById("network-svg");

const algorithmSelect = document.getElementById("algorithm");
const startNodeInput = document.getElementById("start-node");
const targetIdInput = document.getElementById("target-id");

const startBtn = document.getElementById("start-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const resetBtn = document.getElementById("reset-btn");

const routingTable = document.getElementById("routing-table");
const stepDescription = document.getElementById("step-description");
const stepsList = document.getElementById("steps-list");
const searchResult = document.getElementById("search-result");

const hopsCount = document.getElementById("hops-count");
const requestsCount = document.getElementById("requests-count");
const roundsCount = document.getElementById("rounds-count");

// Состояние интерфейса.
// Алгоритмы поиска будут выполняться на Go.
let nodes = [...DEFAULT_NODES];

// --------------------------------------------------
// Вспомогательные функции
// --------------------------------------------------

function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);

    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }

    return element;
}

function addSvgText(parent, x, y, text, attributes = {}) {
    const element = createSvgElement("text", {
        x,
        y,
        ...attributes
    });

    // Используем textContent, а не innerHTML.
    element.textContent = String(text);
    parent.appendChild(element);

    return element;
}

function addSvgLine(parent, x1, y1, x2, y2, attributes = {}) {
    const element = createSvgElement("line", {
        x1,
        y1,
        x2,
        y2,
        ...attributes
    });

    parent.appendChild(element);
    return element;
}

function parseNodeIds(value) {
    const tokens = value.split(",").map(token => token.trim());

    if (tokens.length === 0 || tokens.some(token => token === "")) {
        throw new Error("Введите ID узлов через запятую.");
    }

    const ids = tokens.map(token => {
        if (!/^\d+$/.test(token)) {
            throw new Error(`Некорректный ID узла: ${token}`);
        }

        const id = Number(token);

        if (!Number.isSafeInteger(id) || id < ID_MIN || id > ID_MAX) {
            throw new Error("ID узлов должны находиться в диапазоне 0–63.");
        }

        return id;
    });

    if (new Set(ids).size !== ids.length) {
        throw new Error("ID узлов не должны повторяться.");
    }

    return ids.sort((a, b) => a - b);
}

function readId(input, label) {
    const value = input.value.trim();

    if (value === "") {
        throw new Error(`Укажите ${label}.`);
    }

    const id = Number(value);

    if (
        !Number.isInteger(id) ||
        id < ID_MIN ||
        id > ID_MAX
    ) {
        throw new Error(`${label}: допустимый диапазон — 0–63.`);
    }

    return id;
}

function getStartId() {
    try {
        return readId(startNodeInput, "начальный ID");
    } catch {
        return null;
    }
}

function getTargetId() {
    try {
        return readId(targetIdInput, "целевой ID");
    } catch {
        return null;
    }
}

function setMessage(message, resultMessage = null) {
    stepDescription.textContent = message;

    if (resultMessage !== null) {
        searchResult.textContent = resultMessage;
    }
}

function clearSimulationResults() {
    hopsCount.textContent = "0";
    requestsCount.textContent = "0";
    roundsCount.textContent = "0";

    stepsList.replaceChildren();

    prevBtn.disabled = true;
    nextBtn.disabled = true;
}

function clearSvg() {
    networkSvg.replaceChildren();
}

function resetSimulation() {
    clearSimulationResults();
    updateRoutingPlaceholder();

    setMessage(
        "Симуляция сброшена. Сеть и параметры сохранены.",
        "Поиск ещё не выполнялся."
    );

    renderNetwork();
}

// --------------------------------------------------
// Визуализация Chord
// --------------------------------------------------

function renderChordNetwork() {
    clearSvg();

    const width = 800;
    const height = 450;
    const centerX = width / 2;
    const centerY = height / 2;
    const ringRadius = 140;
    const nodeRadius = 140;
    const labelRadius = 165;

    const startId = getStartId();
    const targetId = getTargetId();

    // Окружность ID-пространства.
    networkSvg.appendChild(createSvgElement("circle", {
        cx: centerX,
        cy: centerY,
        r: ringRadius,
        fill: "none",
        stroke: "#354158",
        "stroke-width": 2
    }));

    // Отметки ID от 0 до 63.
    for (let id = 0; id < 64; id++) {
        const angle = (id / 64) * Math.PI * 2 - Math.PI / 2;

        const innerRadius = id % 8 === 0 ? 143 : 146;
        const outerRadius = id % 8 === 0 ? 153 : 150;

        const x1 = centerX + Math.cos(angle) * innerRadius;
        const y1 = centerY + Math.sin(angle) * innerRadius;
        const x2 = centerX + Math.cos(angle) * outerRadius;
        const y2 = centerY + Math.sin(angle) * outerRadius;

        addSvgLine(networkSvg, x1, y1, x2, y2, {
            stroke: id % 8 === 0 ? "#8292ad" : "#354158",
            "stroke-width": id % 8 === 0 ? 1.5 : 0.8
        });
    }

    // Подписи на главных делениях кольца.
    for (let id = 0; id < 64; id += 8) {
        const angle = (id / 64) * Math.PI * 2 - Math.PI / 2;
        const labelX = centerX + Math.cos(angle) * 187;
        const labelY = centerY + Math.sin(angle) * 187;

        addSvgText(networkSvg, labelX, labelY, id, {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 12
        });
    }

    // Центральная подпись.
    addSvgText(networkSvg, centerX, centerY - 20, "CHORD", {
        "text-anchor": "middle",
        "font-size": 18,
        "font-weight": 700
    }).style.fill = "#e8eef8";

    addSvgText(networkSvg, centerX, centerY + 4, "6-bit ID space", {
        "text-anchor": "middle",
        "font-size": 12
    });

    addSvgText(
        networkSvg,
        centerX,
        centerY + 25,
        `Узлов: ${nodes.length}`,
        {
            "text-anchor": "middle",
            "font-size": 12
        }
    );

    // Целевой ID может не принадлежать сети.
    if (targetId !== null) {
        const angle = (targetId / 64) * Math.PI * 2 - Math.PI / 2;

        const x = centerX + Math.cos(angle) * ringRadius;
        const y = centerY + Math.sin(angle) * ringRadius;

        networkSvg.appendChild(createSvgElement("circle", {
            cx: x,
            cy: y,
            r: 11,
            fill: "none",
            stroke: "#f6ad55",
            "stroke-width": 2,
            "stroke-dasharray": "3 3"
        }));

        const marker = createSvgElement("circle", {
            cx: x,
            cy: y,
            r: 4,
            fill: "#f6ad55"
        });

        const title = createSvgElement("title");
        title.textContent = `Target ID: ${targetId}`;
        marker.appendChild(title);

        networkSvg.appendChild(marker);
    }

    // Отрисовка виртуальных узлов.
    for (const id of nodes) {
        const angle = (id / 64) * Math.PI * 2 - Math.PI / 2;

        const x = centerX + Math.cos(angle) * nodeRadius;
        const y = centerY + Math.sin(angle) * nodeRadius;

        const labelX = centerX + Math.cos(angle) * labelRadius;
        const labelY = centerY + Math.sin(angle) * labelRadius;

        const isStart = id === startId;

        const node = createSvgElement("circle", {
            cx: x,
            cy: y,
            r: isStart ? 9 : 6,
            stroke: isStart ? "#e8f6ff" : "#a7b4c9",
            "stroke-width": isStart ? 2.5 : 1.5
        });

        node.style.fill = isStart ? "#63b3ed" : "#8292ad";

        const title = createSvgElement("title");
        title.textContent = isStart
            ? `Узел ${id}: начальный узел`
            : `Узел ${id}`;

        node.appendChild(title);
        networkSvg.appendChild(node);

        const label = addSvgText(networkSvg, labelX, labelY, id, {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 12,
            "font-weight": isStart ? 700 : 500
        });

        label.style.fill = isStart ? "#63b3ed" : "#c4cede";
    }

    // Легенда.
    addSvgText(networkSvg, 24, 425, "● Начальный узел", {
        "font-size": 12
    }).style.fill = "#63b3ed";

    addSvgText(networkSvg, 205, 425, "◎ Целевой ID", {
        "font-size": 12
    }).style.fill = "#f6ad55";

    networkSvg.setAttribute(
        "aria-label",
        `Кольцо Chord. Узлов: ${nodes.length}. ` +
        `Старт: ${startId ?? "не задан"}. ` +
        `Цель: ${targetId ?? "не задан"}.`
    );
}

// --------------------------------------------------
// Визуализация Kademlia
// --------------------------------------------------

function renderKademliaDistanceMap() {
    clearSvg();

    const width = 800;
    const height = 450;

    const left = 60;
    const right = 755;
    const axisY = 325;

    const targetId = getTargetId();
    const startId = getStartId();

    addSvgText(networkSvg, 24, 30, "KADEMLIA", {
        "font-size": 18,
        "font-weight": 700
    }).style.fill = "#e8eef8";

    addSvgText(
        networkSvg,
        24,
        52,
        "Узлы расположены по XOR-расстоянию до целевого ID",
        { "font-size": 12 }
    );

    if (targetId === null) {
        addSvgText(
            networkSvg,
            width / 2,
            height / 2,
            "Укажите целевой ID",
            { "text-anchor": "middle", "font-size": 14 }
        );

        return;
    }

    // Для шестибитных ID: distance = nodeID XOR targetID.
    // Минимальное расстояние — 0, максимальное — 63.
    const xForDistance = distance =>
        left + (distance / 63) * (right - left);

    // Горизонтальная ось XOR-расстояний.
    addSvgLine(networkSvg, left, axisY, right, axisY, {
        stroke: "#52627b",
        "stroke-width": 1.5
    });

    // Деления шкалы.
    for (let distance = 0; distance <= 63; distance += 7) {
        const x = xForDistance(distance);

        addSvgLine(
            networkSvg,
            x,
            axisY - 6,
            x,
            axisY + 6,
            {
                stroke: "#71829e",
                "stroke-width": 1
            }
        );

        addSvgText(
            networkSvg,
            x,
            axisY + 22,
            distance,
            {
                "text-anchor": "middle",
                "font-size": 10
            }
        );
    }

    // Отдельная отметка максимального расстояния.
    addSvgText(
        networkSvg,
        xForDistance(63),
        axisY + 22,
        "63",
        { "text-anchor": "middle", "font-size": 10 }
    );

    // Цель соответствует расстоянию 0.
    const targetX = xForDistance(0);

    addSvgLine(
        networkSvg,
        targetX,
        75,
        targetX,
        axisY,
        {
            stroke: "#f6ad55",
            "stroke-width": 1.5,
            "stroke-dasharray": "5 4"
        }
    );

    addSvgText(
        networkSvg,
        targetX + 5,
        72,
        `Target ${targetId}`,
        { "font-size": 11, "font-weight": 700 }
    ).style.fill = "#f6ad55";

    // Сортировка по реальному XOR-расстоянию.
    const sortedNodes = nodes
        .map(id => ({
            id,
            distance: id ^ targetId
        }))
        .sort((a, b) => a.distance - b.distance);

    // Четыре визуальных ряда уменьшают наложение подписей.
    const laneY = [112, 166, 220, 274];

    sortedNodes.forEach((item, index) => {
        const x = xForDistance(item.distance);
        const y = laneY[index % laneY.length];
        const isStart = item.id === startId;

        // Соединяем точку узла со шкалой.
        addSvgLine(
            networkSvg,
            x,
            y + 9,
            x,
            axisY - 5,
            {
                stroke: isStart ? "#63b3ed" : "#354158",
                "stroke-width": isStart ? 1.8 : 1
            }
        );

        const node = createSvgElement("circle", {
            cx: x,
            cy: y,
            r: isStart ? 8 : 6,
            stroke: isStart ? "#e8f6ff" : "#a7b4c9",
            "stroke-width": isStart ? 2 : 1
        });

        node.style.fill = isStart ? "#63b3ed" : "#8292ad";

        const title = createSvgElement("title");
        title.textContent =
            `Узел ${item.id}; XOR-расстояние: ${item.distance}`;

        node.appendChild(title);
        networkSvg.appendChild(node);

        const idLabel = addSvgText(
            networkSvg,
            x,
            y - 13,
            item.id,
            {
                "text-anchor": "middle",
                "font-size": 12,
                "font-weight": isStart ? 700 : 500
            }
        );

        idLabel.style.fill = isStart ? "#63b3ed" : "#d4dbea";

        const distanceLabel = addSvgText(
            networkSvg,
            x,
            y + 22,
            `d=${item.distance}`,
            {
                "text-anchor": "middle",
                "font-size": 10
            }
        );

        distanceLabel.style.fill = "#91a0b8";
    });

    // Легенда и пояснение.
    addSvgText(networkSvg, 24, 395, "● Начальный узел", {
        "font-size": 12
    }).style.fill = "#63b3ed";

    addSvgText(networkSvg, 205, 395, "│ Целевой ID", {
        "font-size": 12
    }).style.fill = "#f6ad55";

    addSvgText(
        networkSvg,
        24,
        423,
        "d = nodeID XOR targetID. Меньшее d означает меньшую XOR-дистанцию.",
        { "font-size": 11 }
    );

    networkSvg.setAttribute(
        "aria-label",
        `Карта XOR-расстояний Kademlia. Цель ${targetId}. ` +
        `Узлов: ${nodes.length}.`
    );
}

// --------------------------------------------------
// Выбор визуализации
// --------------------------------------------------

function renderNetwork() {
    if (algorithmSelect.value === "kademlia") {
        renderKademliaDistanceMap();
    } else {
        renderChordNetwork();
    }
}

// --------------------------------------------------
// Таблица маршрутизации
// --------------------------------------------------

function updateRoutingPlaceholder() {
    const description = document.createElement("p");

    if (algorithmSelect.value === "chord") {
        description.textContent =
            "Finger Table появится после подключения Go API.";
    } else {
        description.textContent =
            "k-buckets и XOR-расстояния появятся после подключения Go API.";
    }

    routingTable.replaceChildren(description);
}

// --------------------------------------------------
// Создание сети
// --------------------------------------------------

function createNetwork() {
    let parsedNodes;

    try {
        parsedNodes = parseNodeIds(nodeIdsInput.value);
    } catch (error) {
        setMessage(error.message, "Сеть не изменена.");
        return;
    }

    nodes = parsedNodes;

    clearSimulationResults();
    updateRoutingPlaceholder();
    renderNetwork();

    const startId = getStartId();

    if (startId === null) {
        setMessage(
            `Создана сеть из ${nodes.length} узлов. ` +
            "Укажите начальный ID.",
            "Поиск ещё не выполнялся."
        );
        return;
    }

    if (!nodes.includes(startId)) {
        setMessage(
            `Создана сеть из ${nodes.length} узлов, но узел ${startId} ` +
            "отсутствует в ней. Выберите существующий узел.",
            "Поиск ещё не выполнялся."
        );
        return;
    }

    setMessage(
        `Сеть создана: ${nodes.length} узлов. ` +
        "Настройте параметры поиска.",
        "Поиск ещё не выполнялся."
    );
}

function generateRandomNetwork() {
    const generated = new Set();

    while (generated.size < 10) {
        generated.add(
            Math.floor(Math.random() * (ID_MAX + 1))
        );
    }

    nodes = [...generated].sort((a, b) => a - b);

    nodeIdsInput.value = nodes.join(", ");

    const randomStartIndex = Math.floor(
        Math.random() * nodes.length
    );

    startNodeInput.value = String(nodes[randomStartIndex]);

    clearSimulationResults();
    updateRoutingPlaceholder();
    renderNetwork();

    setMessage(
        `Сгенерирована сеть из ${nodes.length} узлов. ` +
        "Выберите целевой ID и запустите поиск.",
        "Поиск ещё не выполнялся."
    );
}

// --------------------------------------------------
// Запуск поиска
// --------------------------------------------------

function startSimulation() {
    const startId = getStartId();
    const targetId = getTargetId();

    if (nodes.length === 0) {
        setMessage("Сначала создайте сеть.");
        return;
    }

    if (startId === null || targetId === null) {
        setMessage("Укажите корректные начальный и целевой ID.");
        return;
    }

    if (!nodes.includes(startId)) {
        setMessage(
            `Начальный узел ${startId} отсутствует в сети. ` +
            "Выберите существующий узел."
        );
        return;
    }

    // Здесь пока не выполняется поиск.
    // Настоящий маршрут, шаги и метрики должен возвращать Go API.
    clearSimulationResults();

    const algorithmName = algorithmSelect.value === "chord"
        ? "Chord"
        : "Kademlia";

    setMessage(
        `Параметры приняты: ${algorithmName}, старт ${startId}, ` +
        `цель ${targetId}. Go API симуляции ещё не подключён.`,
        "Маршрут не рассчитывался."
    );
}

// --------------------------------------------------
// События интерфейса
// --------------------------------------------------

createNetworkBtn.addEventListener("click", createNetwork);

randomNetworkBtn.addEventListener(
    "click",
    generateRandomNetwork
);

startBtn.addEventListener("click", startSimulation);

resetBtn.addEventListener("click", resetSimulation);

prevBtn.addEventListener("click", () => {
    setMessage(
        "Пошаговая навигация станет доступна после подключения Go API."
    );
});

nextBtn.addEventListener("click", () => {
    setMessage(
        "Пошаговая навигация станет доступна после подключения Go API."
    );
});

algorithmSelect.addEventListener("change", () => {
    updateRoutingPlaceholder();
    renderNetwork();
});

startNodeInput.addEventListener("input", renderNetwork);
targetIdInput.addEventListener("input", renderNetwork);

// --------------------------------------------------
// Инициализация
// --------------------------------------------------

try {
    nodes = parseNodeIds(nodeIdsInput.value);
} catch {
    nodes = [...DEFAULT_NODES];
    nodeIdsInput.value = nodes.join(", ");
}

clearSimulationResults();
updateRoutingPlaceholder();
renderNetwork();

setMessage(
    "Сеть подготовлена. Выберите алгоритм и параметры поиска.",
    "Поиск ещё не выполнялся."
);
