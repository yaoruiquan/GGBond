package admin

import (
	"net/http"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/gin-gonic/gin"
)

// GetPaymentExchangeRate returns a cached reference quote without changing settings.
func (h *SettingHandler) GetPaymentExchangeRate(c *gin.Context) {
	quote, err := h.paymentExchangeRate.Get(c.Request.Context())
	if err != nil {
		response.ErrorWithDetails(c, http.StatusServiceUnavailable,
			"Exchange rate reference is temporarily unavailable", "EXCHANGE_RATE_UNAVAILABLE", nil)
		return
	}
	response.Success(c, quote)
}
