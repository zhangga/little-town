package router

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zhangga/little-town/backend/internal/config"
)

func TestHealthAndReadinessAreDifferent(t *testing.T) {
	r := SetupRouter(nil, &config.Config{})
	for path, status := range map[string]int{"/health": 200, "/ready": 503, "/internal/jobs/daily-push": 404} {
		method := "GET"
		if strings.Contains(path, "jobs") {
			method = "POST"
		}
		res := httptest.NewRecorder()
		r.ServeHTTP(res, httptest.NewRequest(method, path, nil))
		if res.Code != status {
			t.Fatalf("%s: got %d want %d", path, res.Code, status)
		}
	}
}

func TestExternalJobRequiresItsOwnCredential(t *testing.T) {
	key := strings.Repeat("j", 40)
	r := SetupRouter(nil, &config.Config{JobToken: key})
	for _, token := range []string{"", key, "Bearer forged-jwt", "Bearer " + key} {
		req := httptest.NewRequest("POST", "/internal/jobs/daily-push", nil)
		req.Header.Set("Authorization", token)
		res := httptest.NewRecorder()
		r.ServeHTTP(res, req)
		want := 401
		if token == "Bearer "+key {
			want = 200
		} // 微信未配置时返回 skipped，不发消息。
		if res.Code != want {
			t.Fatalf("job status=%d want=%d", res.Code, want)
		}
	}
}

func TestProductionCannotFallbackToMockLogin(t *testing.T) {
	r := SetupRouter(nil, &config.Config{Env: "production"})
	res := httptest.NewRecorder()
	r.ServeHTTP(res, httptest.NewRequest("POST", "/api/v1/auth/login", strings.NewReader(`{"code":"dev:must-not-login"}`)))
	if res.Code != 401 {
		t.Fatalf("production mock login: got %d want 401", res.Code)
	}
}

func TestPracticeRoutesRequireLogin(t *testing.T) {
	r := SetupRouter(nil, &config.Config{})
	for _, path := range []string{"/api/v1/learn/practice/answer", "/api/v1/learn/practice/complete"} {
		res := httptest.NewRecorder()
		r.ServeHTTP(res, httptest.NewRequest("POST", path, strings.NewReader(`{}`)))
		if res.Code != 401 {
			t.Fatalf("%s must require login, got %d", path, res.Code)
		}
	}
}

func TestTownLifeRoutesRequireLogin(t *testing.T) {
	r := SetupRouter(nil, &config.Config{})
	for path, method := range map[string]string{
		"/api/v1/town-life":                   "GET",
		"/api/v1/town-life/pets/purchase":     "POST",
		"/api/v1/town-life/supplies/purchase": "POST",
		"/api/v1/town-life/events/resolve":    "POST",
		"/api/v1/town-life/activities/start":  "POST",
	} {
		res := httptest.NewRecorder()
		r.ServeHTTP(res, httptest.NewRequest(method, path, strings.NewReader(`{}`)))
		if res.Code != 401 {
			t.Fatalf("%s must require login, got %d", path, res.Code)
		}
	}
}

func TestTownLayoutRequiresLogin(t *testing.T) {
	r := SetupRouter(nil, &config.Config{})
	res := httptest.NewRecorder()
	r.ServeHTTP(res, httptest.NewRequest("PUT", "/api/v1/buildings/layout", strings.NewReader(`{}`)))
	if res.Code != 401 {
		t.Fatalf("layout must require login, got %d", res.Code)
	}
}

func TestRestaurantRoutesRequireLogin(t *testing.T) {
	r := SetupRouter(nil, &config.Config{})
	for path, method := range map[string]string{
		"/api/v1/restaurant":            "GET",
		"/api/v1/restaurant/recipes":    "POST",
		"/api/v1/restaurant/signatures": "PUT",
		"/api/v1/restaurant/serve":      "POST",
	} {
		res := httptest.NewRecorder()
		r.ServeHTTP(res, httptest.NewRequest(method, path, strings.NewReader(`{}`)))
		if res.Code != 401 {
			t.Fatalf("%s must require login, got %d", path, res.Code)
		}
	}
}
