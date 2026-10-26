package kademlia

import (
	"fmt"
	"math/bits"
	"sort"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/network"
)

type Config struct {
	K     int
	Alpha int
}

type Node struct {
	network.Node
	Buckets [][]int
}

type DHT struct {
	bits   int
	config Config
	nodes  map[int]*Node
}

type PeerReply struct {
	PeerID   int   `json:"peer_id"`
	Returned []int `json:"returned"`
}

type RoundStep struct {
	Round       int         `json:"round"`
	Queried     []int       `json:"queried"`
	Replies     []PeerReply `json:"replies"`
	Closest     []int       `json:"closest"`
	Requests    int         `json:"requests"`
	Description string      `json:"description"`
}

type LookupResult struct {
	StartNode    int             `json:"start_node"`
	TargetID     int             `json:"target_id"`
	ClosestNodes []int           `json:"closest_nodes"`
	ExactMatch   bool            `json:"exact_match"`
	Requests     int             `json:"requests"`
	Rounds       int             `json:"rounds"`
	Steps        []RoundStep     `json:"steps"`
	Buckets      map[int][][]int `json:"buckets"`
}

func XORDistance(a, b int) int {
	return a ^ b
}

func BucketIndex(a, b int) int {
	distance := XORDistance(a, b)

	if distance == 0 {
		return -1
	}

	return bits.Len(uint(distance)) - 1
}

func NewDHT(net *network.Network, cfg Config) (*DHT, error) {
	if net == nil {
		return nil, fmt.Errorf("network cannot be nil")
	}

	if cfg.K < 1 {
		return nil, fmt.Errorf("k must be greater than zero")
	}

	if cfg.Alpha < 1 || cfg.Alpha > cfg.K {
		return nil, fmt.Errorf(
			"alpha must be between 1 and k (%d)",
			cfg.K,
		)
	}

	ids := net.NodeIDs()

	if len(ids) == 0 {
		return nil, fmt.Errorf("network cannot be empty")
	}

	d := &DHT{
		bits:   net.Bits(),
		config: cfg,
		nodes:  make(map[int]*Node, len(ids)),
	}

	for _, id := range ids {
		d.nodes[id] = &Node{
			Node: network.Node{
				ID: id,
			},
			Buckets: make([][]int, d.bits),
		}
	}

	for _, id := range ids {
		for _, other := range ids {
			if id == other {
				continue
			}

			index := BucketIndex(id, other)

			if index < 0 || index >= d.bits {
				return nil, fmt.Errorf(
					"invalid bucket index for nodes %d and %d",
					id,
					other,
				)
			}

			if len(d.nodes[id].Buckets[index]) < cfg.K {
				d.nodes[id].Buckets[index] = append(
					d.nodes[id].Buckets[index],
					other,
				)
			}
		}
	}

	return d, nil
}

func (d *DHT) GetBuckets(nodeID int) ([][]int, error) {
	if d == nil {
		return nil, fmt.Errorf("DHT is nil")
	}

	node, ok := d.nodes[nodeID]

	if !ok {
		return nil, fmt.Errorf("node %d not found", nodeID)
	}

	copyOfBuckets := make([][]int, len(node.Buckets))

	for i, bucket := range node.Buckets {
		copyOfBuckets[i] = append([]int{}, bucket...)
	}

	return copyOfBuckets, nil
}

func (d *DHT) bucketsSnapshot() map[int][][]int {
	tables := make(map[int][][]int, len(d.nodes))

	for id := range d.nodes {
		tables[id], _ = d.GetBuckets(id)
	}

	return tables
}

func sortByTarget(ids []int, targetID int) {
	sort.Slice(ids, func(i, j int) bool {
		a := XORDistance(ids[i], targetID)
		b := XORDistance(ids[j], targetID)

		if a != b {
			return a < b
		}

		return ids[i] < ids[j]
	})
}

func (d *DHT) ClosestContacts(
	nodeID, targetID, limit int,
) ([]int, error) {
	if d == nil {
		return nil, fmt.Errorf("DHT is nil")
	}

	if targetID < 0 || targetID >= 1<<d.bits {
		return nil, fmt.Errorf(
			"target ID %d is outside the ID space",
			targetID,
		)
	}

	if limit < 1 {
		return nil, fmt.Errorf("limit must be greater than zero")
	}

	node, ok := d.nodes[nodeID]

	if !ok {
		return nil, fmt.Errorf("node %d not found", nodeID)
	}

	contacts := make([]int, 0)

	for _, bucket := range node.Buckets {
		contacts = append(contacts, bucket...)
	}

	sortByTarget(contacts, targetID)

	if len(contacts) > limit {
		contacts = contacts[:limit]
	}

	return contacts, nil
}

func (d *DHT) nearestKnown(
	known map[int]bool,
	targetID int,
) []int {
	ids := make([]int, 0, len(known))

	for id := range known {
		ids = append(ids, id)
	}

	sortByTarget(ids, targetID)

	if len(ids) > d.config.K {
		ids = ids[:d.config.K]
	}

	return ids
}

func (d *DHT) Lookup(
	startNode, targetID int,
) (LookupResult, error) {
	if d == nil {
		return LookupResult{}, fmt.Errorf("DHT is nil")
	}

	if _, ok := d.nodes[startNode]; !ok {
		return LookupResult{}, fmt.Errorf(
			"start node %d does not exist",
			startNode,
		)
	}

	if targetID < 0 || targetID >= 1<<d.bits {
		return LookupResult{}, fmt.Errorf(
			"target ID %d is outside the ID space",
			targetID,
		)
	}

	// Начальный узел знает себя и контакты
	// из своих k-buckets.
	known := map[int]bool{
		startNode: true,
	}

	// Самого себя запрашивать не нужно.
	queried := map[int]bool{
		startNode: true,
	}

	for _, bucket := range d.nodes[startNode].Buckets {
		for _, id := range bucket {
			known[id] = true
		}
	}

	result := LookupResult{
		StartNode: startNode,
		TargetID:  targetID,
		Steps:     []RoundStep{},
		Buckets:   d.bucketsSnapshot(),
	}

	for {
		// 1. Получаем ближайшие известные узлы.
		shortlist := d.nearestKnown(known, targetID)

		// 2. Выбираем до Alpha ещё не опрошенных узлов.
		batch := make([]int, 0, d.config.Alpha)

		for _, id := range shortlist {
			if queried[id] {
				continue
			}

			batch = append(batch, id)

			if len(batch) == d.config.Alpha {
				break
			}
		}

		// Больше некого опрашивать.
		if len(batch) == 0 {
			break
		}

		// 3. Собираем ответы всего раунда.
		// Новые контакты пока НЕ добавляем в known.
		replies := make([]PeerReply, 0, len(batch))

		for _, peerID := range batch {
			contacts, err := d.ClosestContacts(
				peerID,
				targetID,
				d.config.K,
			)

			if err != nil {
				return LookupResult{}, err
			}

			replies = append(replies, PeerReply{
				PeerID:   peerID,
				Returned: contacts,
			})
		}

		// 4. После получения всех ответов
		// обновляем известные контакты.
		for _, reply := range replies {
			queried[reply.PeerID] = true

			for _, id := range reply.Returned {
				known[id] = true
			}
		}

		// 5. Обновляем метрики.
		result.Rounds++
		result.Requests += len(batch)

		// 6. Формируем shortlist после раунда.
		closest := d.nearestKnown(known, targetID)

		// 7. Сохраняем ОДИН шаг на весь раунд.
		result.Steps = append(result.Steps, RoundStep{
			Round:    result.Rounds,
			Queried:  append([]int{}, batch...),
			Replies:  replies,
			Closest:  closest,
			Requests: result.Requests,
			Description: fmt.Sprintf(
				"Раунд %d: FIND_NODE(%d) отправлен узлам %v. "+
					"Ближайшие известные узлы: %v.",
				result.Rounds,
				targetID,
				batch,
				closest,
			),
		})
	}

	result.ClosestNodes = d.nearestKnown(known, targetID)

	result.ExactMatch = len(result.ClosestNodes) > 0 &&
		result.ClosestNodes[0] == targetID

	return result, nil
}
