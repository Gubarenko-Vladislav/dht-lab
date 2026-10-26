package simulation

import (
	"fmt"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/chord"
	"github.com/Gubarenko-Vladislav/dht-lab/internal/network"
)

type Request struct {
	Algorithm string `json:"algorithm"`
	Bits      int    `json:"bits"`
	Nodes     []int  `json:"nodes"`
	StartNode int    `json:"start_node"`
	TargetID  int    `json:"target_id"`
}

type Result struct {
	Algorithm string              `json:"algorithm"`
	Chord     *chord.LookupResult `json:"chord,omitempty"`
}

func Run(req Request) (Result, error) {
	switch req.Algorithm {
	case "chord":
		net, err := network.NewNetwork(req.Nodes, req.Bits)
		if err != nil {
			return Result{}, err
		}
		ring, err := chord.NewRing(net)
		if err != nil {
			return Result{}, err
		}
		resLookup, err := ring.Lookup(req.StartNode, req.TargetID)
		if err != nil {
			return Result{}, err
		}
		result := Result{
			Algorithm: "chord",
			Chord:     &resLookup,
		}
		return result, nil
	case "kademlia":
		return Result{}, fmt.Errorf(
			"алгоритм Kademlia пока не реализован",
		)

	default:
		return Result{}, fmt.Errorf(
			"неизвестный алгоритм: %s",
			req.Algorithm,
		)
	}
}
