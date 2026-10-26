package chord

import (
	"fmt"
	"sort"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/network"
)

type Node struct {
	network.Node

	Successor   int
	Predecessor int
	FingerTable []int
}

type Ring struct {
	bits      int
	nodes     map[int]*Node
	sortedIDs []int
}

func NewRing(net *network.Network) (*Ring, error) {
	if net == nil {
		return nil, fmt.Errorf("network cannot be nil")
	}

	bits := net.Bits()
	ids := net.NodeIDs()
	size := len(ids)

	if size == 0 {
		return nil, fmt.Errorf("network cannot be empty")
	}

	ring := &Ring{
		bits:      bits,
		nodes:     make(map[int]*Node, size),
		sortedIDs: ids,
	}

	for i, id := range ids {
		nextIndex := (i + 1) % size
		prevIndex := (i - 1 + size) % size

		ring.nodes[id] = &Node{
			Node:        network.Node{ID: id},
			Successor:   ids[nextIndex],
			Predecessor: ids[prevIndex],
			FingerTable: ring.buildFingerTable(id),
		}
	}

	return ring, nil
}

func (r *Ring) Successor(id int) int {
	idx := sort.SearchInts(r.sortedIDs, id)

	if idx == len(r.sortedIDs) {
		return r.sortedIDs[0]
	}

	return r.sortedIDs[idx]
}

func (r *Ring) buildFingerTable(id int) []int {
	fingerTable := make([]int, 0, r.bits)

	for i := 0; i < r.bits; i++ {
		start := (id + (1 << i)) % (1 << r.bits)
		fingerTable = append(fingerTable, r.Successor(start))
	}
	return fingerTable
}

func inOpenInterval(id, start, end int) bool {
	if start == end {
		return false
	}

	if start < end {
		return id > start && id < end
	}

	return id > start || id < end
}

func (r *Ring) ClosestPrecedingFinger(nodeID, targetID int) int {
	for i := r.bits - 1; i >= 0; i-- {
		fingerID := r.nodes[nodeID].FingerTable[i]
		if inOpenInterval(fingerID, nodeID, targetID) {
			return fingerID
		}
	}
	return nodeID
}

type LookupStep struct {
	FromID      int    `json:"from_id"`
	ToID        int    `json:"to_id"`
	Action      string `json:"action"`
	Description string `json:"description"`
}

type LookupResult struct {
	TargetID int          `json:"target_id"`
	OwnerID  int          `json:"owner_id"`
	Route    []int        `json:"route"`
	Hops     int          `json:"hops"`
	Steps    []LookupStep `json:"steps"`
}

func (r *Ring) Lookup(nodeID, targetID int) (LookupResult, error) {
	if r == nil {
		return LookupResult{}, fmt.Errorf("кольцо не создано")
	}

	if _, ok := r.nodes[nodeID]; !ok {
		return LookupResult{}, fmt.Errorf(
			"начальный узел %d отсутствует в кольце",
			nodeID,
		)
	}

	size := 1 << r.bits
	if targetID < 0 || targetID >= size {
		return LookupResult{}, fmt.Errorf(
			"ID %d вне диапазона 0–%d",
			targetID, size-1,
		)
	}

	result := LookupResult{
		TargetID: targetID,
		OwnerID:  nodeID,
		Route:    []int{nodeID},
		Hops:     0,
		Steps:    []LookupStep{},
	}

	if len(r.sortedIDs) == 1 {
		result.Steps = append(result.Steps, LookupStep{
			FromID: nodeID,
			ToID:   nodeID,
			Action: "found",
			Description: fmt.Sprintf(
				"Узел %d — единственный в кольце и отвечает за ключ %d.",
				nodeID, targetID,
			),
		})

		return result, nil
	}

	currentNode := nodeID

	for attempt := 0; attempt <= len(r.sortedIDs); attempt++ {

		if targetID == currentNode {
			result.OwnerID = currentNode

			result.Steps = append(result.Steps, LookupStep{
				FromID: currentNode,
				ToID:   currentNode,
				Action: "found",
				Description: fmt.Sprintf(
					"Ключ %d совпадает с ID узла %d. Поиск завершён.",
					targetID, currentNode,
				),
			})

			return result, nil
		}

		successor := r.nodes[currentNode].Successor

		if targetID == successor ||
			inOpenInterval(targetID, currentNode, successor) {

			result.OwnerID = successor
			result.Route = append(result.Route, successor)
			result.Hops++

			result.Steps = append(result.Steps, LookupStep{
				FromID: currentNode,
				ToID:   successor,
				Action: "successor",
				Description: fmt.Sprintf(
					"Ключ %d находится в интервале (%d, %d]. "+
						"Ответственный узел — %d. Поиск завершён.",
					targetID, currentNode, successor, successor,
				),
			})

			return result, nil
		}

		nextNode := r.ClosestPrecedingFinger(currentNode, targetID)

		var step LookupStep

		if nextNode != currentNode {
			step = LookupStep{
				FromID: currentNode,
				ToID:   nextNode,
				Action: "finger",
				Description: fmt.Sprintf(
					"Узел %d выбрал finger %d для поиска ключа %d.",
					currentNode, nextNode, targetID,
				),
			}
		} else {
			nextNode = successor

			step = LookupStep{
				FromID: currentNode,
				ToID:   nextNode,
				Action: "successor",
				Description: fmt.Sprintf(
					"Узел %d не нашёл подходящий finger. "+
						"Переходим к successor %d.",
					currentNode, nextNode,
				),
			}
		}

		result.Steps = append(result.Steps, step)
		result.Route = append(result.Route, nextNode)
		result.Hops++

		currentNode = nextNode
	}

	return LookupResult{}, fmt.Errorf(
		"поиск ключа %d не завершился: проверьте таблицы маршрутизации",
		targetID,
	)
}
