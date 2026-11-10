//go:build unit

package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/handler"
	adminhandler "github.com/Wei-Shaw/sub2api/internal/handler/admin"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPaymentExchangeRateRouteRequiresAdminAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterAdminRoutes(router.Group("/api/v1"), &handler.Handlers{Admin: &handler.AdminHandlers{Setting: &adminhandler.SettingHandler{}}},
		middleware.AdminAuthMiddleware(func(c *gin.Context) { c.AbortWithStatus(http.StatusUnauthorized) }),
		middleware.AuditLogMiddleware(func(c *gin.Context) { c.Next() }),
		middleware.StepUpAuthMiddleware(func(c *gin.Context) { c.Next() }), nil, nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/settings/payment-exchange-rate", nil))
	require.Equal(t, http.StatusUnauthorized, recorder.Code)
}
