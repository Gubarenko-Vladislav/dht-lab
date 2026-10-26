package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/api"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           api.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("DHT Lab listening at http://%s", ":"+port)

	log.Fatal(server.ListenAndServe())
}
