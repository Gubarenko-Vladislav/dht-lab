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
