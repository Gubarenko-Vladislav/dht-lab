package api

import (
	"net/http"
)

func NewHandler() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("/", http.FileServer(http.Dir("web")))
	mux.HandleFunc("POST /api/lookup", lookupHandler)

	return mux
}
