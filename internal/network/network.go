package network

import (
	"fmt"
	"sort"
)

const (
	MinBits = 1
	MaxBits = 16
)

type Node struct {
	ID int
}

type Network struct {
	bits  int
	nodes map[int]*Node
}

func NewNetwork(ids []int, bits int) (*Network, error) {
	if bits < MinBits || bits > MaxBits {
		return nil, fmt.Errorf(
			"количество бит должно быть от %d до %d",
			MinBits, MaxBits,
		)
	}

	if len(ids) == 0 {
		return nil, fmt.Errorf("сеть не может быть пустой")
	}

	// Размер пространства идентификаторов: 2^bits.
	size := 1 << bits

	net := &Network{
		bits:  bits,
		nodes: make(map[int]*Node, len(ids)),
	}

	for _, id := range ids {
		if id < 0 || id >= size {
			return nil, fmt.Errorf(
				"ID %d вне диапазона 0–%d",
				id, size-1,
			)
		}

		if _, exists := net.nodes[id]; exists {
			return nil, fmt.Errorf(
				"узел с ID %d уже существует",
				id,
			)
		}

		net.nodes[id] = &Node{
			ID: id,
		}
	}

	return net, nil
}

func (n *Network) Bits() int {
	return n.bits
}

func (n *Network) NodeIDs() []int {
	nodesIDs := make([]int, 0, len(n.nodes))
	for id := range n.nodes {
		nodesIDs = append(nodesIDs, id)
	}
	sort.Ints(nodesIDs)
	return nodesIDs
}
