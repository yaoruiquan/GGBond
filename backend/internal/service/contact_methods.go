package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"log/slog"
	"strings"
	"unicode/utf8"
)

const (
	MaxContactMethods          = 6
	MaxContactLabelRunes       = 40
	MaxContactTextRunes        = 500
	MaxContactImageBytes       = 20 * 1024 * 1024
	MaxContactImagesBytes      = 60 * 1024 * 1024
	MaxContactMethodsJSONBytes = 85 * 1024 * 1024
	MinContactImageDimension   = 1
	MaxContactImageDimension   = 32768
	MaxContactImagePixels      = 100_000_000
)

type ContactMethod struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Text         string `json:"text"`
	ImageDataURL string `json:"image_data_url"`
	Enabled      bool   `json:"enabled"`
}

func (m *ContactMethod) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
		return fmt.Errorf("contact method must be an object")
	}
	for _, key := range []string{"id", "label", "text", "image_data_url", "enabled"} {
		raw, ok := fields[key]
		if !ok || string(raw) == "null" {
			return fmt.Errorf("contact method field %q is required and cannot be null", key)
		}
	}
	type alias ContactMethod
	var parsed alias
	if err := json.Unmarshal(data, &parsed); err != nil {
		return fmt.Errorf("invalid contact method field type")
	}
	*m = ContactMethod(parsed)
	return nil
}

func ValidateContactMethods(methods []ContactMethod) error {
	if len(methods) > MaxContactMethods {
		return fmt.Errorf("contact_methods: maximum %d items", MaxContactMethods)
	}
	seen := make(map[string]struct{}, len(methods))
	var totalImageBytes int
	for i := range methods {
		method := &methods[i]
		method.ID = strings.TrimSpace(method.ID)
		method.Label = strings.TrimSpace(method.Label)
		if !validContactID(method.ID) {
			return fmt.Errorf("contact_methods[%d].id: invalid id", i)
		}
		if _, ok := seen[method.ID]; ok {
			return fmt.Errorf("contact_methods[%d].id: duplicate id", i)
		}
		seen[method.ID] = struct{}{}
		if method.Label == "" || utf8.RuneCountInString(method.Label) > MaxContactLabelRunes {
			return fmt.Errorf("contact_methods[%d].label: must contain 1-%d characters", i, MaxContactLabelRunes)
		}
		if utf8.RuneCountInString(method.Text) > MaxContactTextRunes {
			return fmt.Errorf("contact_methods[%d].text: maximum %d characters", i, MaxContactTextRunes)
		}
		imageBytes, err := validateContactImage(method.ImageDataURL)
		if err != nil {
			return fmt.Errorf("contact_methods[%d].image_data_url: %w", i, err)
		}
		if strings.TrimSpace(method.Text) == "" && method.ImageDataURL == "" {
			return fmt.Errorf("contact_methods[%d]: text or image is required", i)
		}
		totalImageBytes += imageBytes
	}
	if totalImageBytes > MaxContactImagesBytes {
		return fmt.Errorf("contact_methods: total image data exceeds %d bytes", MaxContactImagesBytes)
	}
	encoded, err := json.Marshal(methods)
	if err != nil {
		return fmt.Errorf("contact_methods: encode failed")
	}
	if len(encoded) > MaxContactMethodsJSONBytes {
		return fmt.Errorf("contact_methods: encoded data exceeds %d bytes", MaxContactMethodsJSONBytes)
	}
	return nil
}

func ValidateContactMethodsJSON(raw json.RawMessage) ([]ContactMethod, error) {
	if len(raw) > MaxContactMethodsJSONBytes {
		return nil, fmt.Errorf("contact_methods: encoded data exceeds %d bytes", MaxContactMethodsJSONBytes)
	}
	var methods []ContactMethod
	if err := json.Unmarshal(raw, &methods); err != nil || methods == nil {
		return nil, fmt.Errorf("contact_methods must be a non-null array of complete contact objects")
	}
	if err := ValidateContactMethods(methods); err != nil {
		return nil, err
	}
	return methods, nil
}

func validContactID(id string) bool {
	if len(id) < 1 || len(id) > 64 {
		return false
	}
	for _, char := range id {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' && char != '_' {
			return false
		}
	}
	return true
}

func validateContactImage(value string) (int, error) {
	if value == "" {
		return 0, nil
	}
	var mediaType, encoded string
	switch {
	case strings.HasPrefix(value, "data:image/png;base64,"):
		mediaType, encoded = "image/png", strings.TrimPrefix(value, "data:image/png;base64,")
	case strings.HasPrefix(value, "data:image/jpeg;base64,"):
		mediaType, encoded = "image/jpeg", strings.TrimPrefix(value, "data:image/jpeg;base64,")
	default:
		return 0, fmt.Errorf("only PNG or JPEG base64 data URLs are allowed")
	}
	if strings.ContainsAny(encoded, "\r\n") {
		return 0, fmt.Errorf("invalid base64 image")
	}
	if len(encoded) > base64.StdEncoding.EncodedLen(MaxContactImageBytes) {
		return 0, fmt.Errorf("encoded image exceeds allowed size")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(data) == 0 {
		return 0, fmt.Errorf("invalid base64 image")
	}
	if len(data) > MaxContactImageBytes {
		return 0, fmt.Errorf("image exceeds %d bytes", MaxContactImageBytes)
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, fmt.Errorf("invalid image data")
	}
	if format != strings.TrimPrefix(mediaType, "image/") && (mediaType != "image/jpeg" || format != "jpeg") {
		return 0, fmt.Errorf("image content does not match declared MIME type")
	}
	if config.Width < MinContactImageDimension || config.Height < MinContactImageDimension ||
		config.Width > MaxContactImageDimension || config.Height > MaxContactImageDimension ||
		int64(config.Width)*int64(config.Height) > MaxContactImagePixels {
		return 0, fmt.Errorf("image dimensions exceed allowed limits")
	}
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		return 0, fmt.Errorf("invalid image data")
	}
	return len(data), nil
}

func parseContactMethods(raw string) []ContactMethod {
	methods := []ContactMethod{}
	if raw == "" {
		return methods
	}
	if len(raw) > MaxContactMethodsJSONBytes || json.Unmarshal([]byte(raw), &methods) != nil || methods == nil || ValidateContactMethods(methods) != nil {
		slog.Warn("invalid stored contact methods; hiding configured contacts")
		return []ContactMethod{}
	}
	return methods
}

type cachedContactMethods struct {
	raw     string
	methods []ContactMethod
}

// Validate stored images once per configuration, rather than decoding them on
// every anonymous public-settings request. Comparing the raw value also observes
// updates made by other instances without relying on a local invalidation hook.
func (s *SettingService) parseContactMethods(raw string) []ContactMethod {
	if len(raw) > MaxContactMethodsJSONBytes {
		return parseContactMethods(raw)
	}
	s.contactMethodsMu.Lock()
	defer s.contactMethodsMu.Unlock()
	if s.contactMethodsCache == nil || s.contactMethodsCache.raw != raw {
		s.contactMethodsCache = &cachedContactMethods{raw: raw, methods: parseContactMethods(raw)}
	}
	// Settings validation normalizes entries in place; callers must not mutate
	// the cached slice or the next public response could expose those changes.
	return append([]ContactMethod{}, s.contactMethodsCache.methods...)
}

func (s *SettingService) publicContactMethods(enabled bool, raw string) []ContactMethod {
	public := []ContactMethod{}
	if !enabled {
		return public
	}
	for _, method := range s.parseContactMethods(raw) {
		if method.Enabled {
			public = append(public, method)
		}
	}
	return public
}
