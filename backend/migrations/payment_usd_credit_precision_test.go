package migrations

import (
	"strings"
	"testing"

	dbschema "github.com/Wei-Shaw/sub2api/ent/migrate"
	"github.com/stretchr/testify/require"
)

func TestPaymentUSDCreditPrecisionMigration(t *testing.T) {
	raw, err := FS.ReadFile("250_payment_usd_credit_precision.sql")
	require.NoError(t, err)
	sql := strings.Join(strings.Fields(string(raw)), " ")
	for _, field := range []string{"amount", "bonus_amount", "refund_amount", "value"} {
		require.Contains(t, sql, "ALTER COLUMN "+field+" TYPE numeric(20,8)")
	}
	require.NotContains(t, sql, "ALTER COLUMN pay_amount")
	require.NotContains(t, strings.ToUpper(sql), "UPDATE ")
	for _, column := range dbschema.PaymentOrdersColumns {
		switch column.Name {
		case "amount", "bonus_amount", "refund_amount":
			require.Equal(t, "decimal(20,8)", column.SchemaType["postgres"])
		case "pay_amount":
			require.Equal(t, "decimal(20,2)", column.SchemaType["postgres"])
		}
	}
}
