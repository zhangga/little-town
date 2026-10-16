package main

import (
	"io"
	"net/http"
	"os"
	"time"

	"github.com/zhangga/little-town/backend/internal/config"
)

func main() {
	cfg := config.Load()
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + cfg.ServerPort + "/ready")
	if err != nil {
		os.Exit(1)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}
