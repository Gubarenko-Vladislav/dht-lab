package simulation

import (
	"fmt"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/chord"
	"github.com/Gubarenko-Vladislav/dht-lab/internal/kademlia"
	"github.com/Gubarenko-Vladislav/dht-lab/internal/network"
)

type Request struct {
	Algorithm string `json:"algorithm"`
	Bits      int    `json:"bits"`
	Nodes     []int  `json:"nodes"`
	StartNode int    `json:"start_node"`
	TargetID  int    `json:"target_id"`
	K         int    `json:"k"`
	Alpha     int    `json:"alpha"`
}

type Result struct {
	Algorithm string                 `json:"algorithm"`
	Chord     *chord.LookupResult    `json:"chord,omitempty"`
	Kademlia  *kademlia.LookupResult `json:"kademlia,omitempty"`
}

func Run(req Request) (Result, error) {
	net, err := network.NewNetwork(req.Nodes, req.Bits)
	if err != nil {
		return Result{}, err
	}

	switch req.Algorithm {
	case "chord":
		ring, err := chord.NewRing(net)
		if err != nil {
			return Result{}, err
		}

		lookup, err := ring.Lookup(
			req.StartNode, req.TargetID,
		)
		if err != nil {
			return Result{}, err
		}

		return Result{
			Algorithm: "chord",
			Chord:     &lookup,
		}, nil

	case "kademlia":
		cfg := kademlia.Config{
			K:     req.K,
			Alpha: req.Alpha,
		}

		dht, err := kademlia.NewDHT(net, cfg)
		if err != nil {
			return Result{}, err
		}

		lookup, err := dht.Lookup(
			req.StartNode, req.TargetID,
		)
		if err != nil {
			return Result{}, err
		}

		return Result{
			Algorithm: "kademlia",
			Kademlia:  &lookup,
		}, nil

	default:
		return Result{}, fmt.Errorf(
			"unknown algorithm %q", req.Algorithm,
		)
	}
}
