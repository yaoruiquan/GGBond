package config

import (
	"fmt"
	"strconv"
)

const (
	DefaultShutdownTimeoutSeconds = 60
	maxShutdownTimeoutSeconds     = 3600
)

func validateShutdownTimeoutSeconds(seconds int) error {
	if seconds < 1 || seconds > maxShutdownTimeoutSeconds {
		return fmt.Errorf("shutdown_timeout_seconds must be an integer between 1 and %d", maxShutdownTimeoutSeconds)
	}
	return nil
}

func parseShutdownTimeoutSeconds(value any) (int, error) {
	// Do not include raw configuration in errors: it may contain private data.
	invalid := func() (int, error) {
		return 0, fmt.Errorf("shutdown_timeout_seconds must be an integer between 1 and %d", maxShutdownTimeoutSeconds)
	}
	var seconds int
	switch value := value.(type) {
	case int:
		seconds = value
	case string:
		if value == "" {
			return invalid()
		}
		for _, digit := range value {
			if digit < '0' || digit > '9' {
				return invalid()
			}
		}
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return invalid()
		}
		seconds = parsed
	default:
		return invalid()
	}
	if err := validateShutdownTimeoutSeconds(seconds); err != nil {
		return 0, err
	}
	return seconds, nil
}
