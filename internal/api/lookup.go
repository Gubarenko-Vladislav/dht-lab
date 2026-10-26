package api

import (
	"encoding/json"
	"net/http"

	"github.com/Gubarenko-Vladislav/dht-lab/internal/simulation"
)

func lookupHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Проверяем метод запроса
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 2. Читаем JSON из запроса
	var req simulation.Request

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// 3. Выполняем операцию
	response, err := simulation.Run(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 5. Отправляем JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		return
	}
}
