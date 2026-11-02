package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/require"
)

func TestLoadShutdownTimeoutSeconds(t *testing.T) {
	for _, tt := range []struct {
		name    string
		value   string
		want    int
		invalid bool
	}{
		{name: "default", want: 60},
		{name: "minimum", value: "1", want: 1},
		{name: "custom", value: "90", want: 90},
		{name: "maximum", value: "3600", want: 3600},
		{name: "zero", value: "0", invalid: true},
		{name: "negative", value: "-1", invalid: true},
		{name: "too_large", value: "3601", invalid: true},
		{name: "overflow", value: "999999999999999999999999", invalid: true},
		{name: "fraction", value: "1.5", invalid: true},
		{name: "duration", value: "60s", invalid: true},
		{name: "boolean", value: "true", invalid: true},
		{name: "whitespace", value: " ", invalid: true},
		{name: "signed", value: "+60", invalid: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			resetViperWithJWTSecret(t)
			t.Setenv("SHUTDOWN_TIMEOUT_SECONDS", tt.value)
			cfg, err := Load()
			if tt.invalid {
				require.ErrorContains(t, err, "shutdown_timeout_seconds")
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, cfg.ShutdownTimeoutSeconds)
		})
	}
}

func TestLoadShutdownTimeoutConfigFile(t *testing.T) {
	for _, tt := range []struct {
		name    string
		value   string
		invalid bool
	}{
		{name: "integer", value: "120"},
		{name: "fraction", value: "1.5", invalid: true},
		{name: "boolean", value: "true", invalid: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			resetViperWithJWTSecret(t)
			t.Setenv("SHUTDOWN_TIMEOUT_SECONDS", "")
			path := filepath.Join(t.TempDir(), "config.yaml")
			require.NoError(t, os.WriteFile(path, []byte("shutdown_timeout_seconds: "+tt.value+"\n"), 0600))
			t.Setenv("CONFIG_FILE", path)
			cfg, err := LoadForBootstrap()
			if tt.invalid {
				require.ErrorContains(t, err, "shutdown_timeout_seconds")
				return
			}
			require.NoError(t, err)
			require.Equal(t, 120, cfg.ShutdownTimeoutSeconds)
			t.Setenv("SHUTDOWN_TIMEOUT_SECONDS", "90")
			cfg, err = LoadForBootstrap()
			require.NoError(t, err)
			require.Equal(t, 90, cfg.ShutdownTimeoutSeconds)
		})
	}
}

func TestValidateShutdownTimeoutSeconds(t *testing.T) {
	resetViperWithJWTSecret(t)
	t.Setenv("SHUTDOWN_TIMEOUT_SECONDS", "")
	cfg, err := Load()
	require.NoError(t, err)
	for _, value := range []int{0, -1, 3601} {
		candidate := *cfg
		candidate.ShutdownTimeoutSeconds = value
		require.ErrorContains(t, candidate.Validate(), "shutdown_timeout_seconds")
	}
	viper.Set("shutdown_timeout_seconds", 1)
	cfg, err = Load()
	require.NoError(t, err)
	require.Equal(t, 1, cfg.ShutdownTimeoutSeconds)
}
