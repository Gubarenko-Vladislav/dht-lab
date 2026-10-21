package main

import (
	"log"
	"net/http"
	"time"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/api"
)

func main() {
	const addr = "127.0.0.1:8080"

	server := &http.Server{
		Addr:              addr,
		Handler:           api.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("DHT Lab listening at http://%s", addr)

	log.Fatal(server.ListenAndServe())
}
