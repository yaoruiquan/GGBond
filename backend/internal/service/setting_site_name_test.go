package service

import (
	"context"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

type siteNameRepoStub struct {
	values  map[string]string
	written map[string]string
}

func (s *siteNameRepoStub) Get(ctx context.Context, key string) (*Setting, error) {
	panic("unexpected Get call")
}

func (s *siteNameRepoStub) GetValue(ctx context.Context, key string) (string, error) {
	if value, ok := s.values[key]; ok {
		return value, nil
	}
	return "", ErrSettingNotFound
}

func (s *siteNameRepoStub) Set(ctx context.Context, key, value string) error {
	panic("unexpected Set call")
}

func (s *siteNameRepoStub) GetMultiple(ctx context.Context, keys []string) (map[string]string, error) {
	out := make(map[string]string, len(keys))
	for _, key := range keys {
		if value, ok := s.values[key]; ok {
			out[key] = value
		}
	}
	return out, nil
}

func (s *siteNameRepoStub) SetMultiple(ctx context.Context, settings map[string]string) error {
	s.written = make(map[string]string, len(settings))
	for key, value := range settings {
		s.written[key] = value
	}
	return nil
}

func (s *siteNameRepoStub) GetAll(ctx context.Context) (map[string]string, error) {
	panic("unexpected GetAll call")
}

func (s *siteNameRepoStub) Delete(ctx context.Context, key string) error {
	panic("unexpected Delete call")
}

func TestGetSiteName_MissingConfigurationFallsBackToDefaultBrand(t *testing.T) {
	repo := &siteNameRepoStub{values: map[string]string{}}
	svc := NewSettingService(repo, &config.Config{})

	name := svc.GetSiteName(context.Background())

	require.Equal(t, defaultSiteName, name)
}

func TestGetSiteName_ExplicitSub2APIIsNotOverridden(t *testing.T) {
	repo := &siteNameRepoStub{values: map[string]string{
		SettingKeySiteName: "Sub2API",
	}}
	svc := NewSettingService(repo, &config.Config{})

	name := svc.GetSiteName(context.Background())

	require.Equal(t, "Sub2API", name)
}

func TestGetSiteName_CustomNameFromDatabaseTakesPrecedence(t *testing.T) {
	repo := &siteNameRepoStub{values: map[string]string{
		SettingKeySiteName: "   Acme Corp   ",
	}}
	svc := NewSettingService(repo, &config.Config{})

	name := svc.GetSiteName(context.Background())

	require.Equal(t, "Acme Corp", name)
}

func TestInitializeDefaultSettings_SiteNameDefaultsToGGbondAI(t *testing.T) {
	repo := &siteNameRepoStub{values: map[string]string{}}
	svc := NewSettingService(repo, &config.Config{})

	require.NoError(t, svc.InitializeDefaultSettings(context.Background()))

	require.Equal(t, defaultSiteName, repo.written[SettingKeySiteName])
}

func TestParseSettings_SiteNameMissingFallsBackToGGbondAI(t *testing.T) {
	svc := NewSettingService(&siteNameRepoStub{values: map[string]string{}}, &config.Config{})

	settings := svc.parseSettings(map[string]string{})

	require.Equal(t, defaultSiteName, settings.SiteName)
}

func TestParseSettings_ExplicitSiteNameIsNotOverridden(t *testing.T) {
	svc := NewSettingService(&siteNameRepoStub{values: map[string]string{}}, &config.Config{})

	settings := svc.parseSettings(map[string]string{SettingKeySiteName: "Sub2API"})

	require.Equal(t, "Sub2API", settings.SiteName)
}

func TestGetPublicSettings_SiteNameMissingFallsBackToGGbondAI(t *testing.T) {
	repo := &siteNameRepoStub{values: map[string]string{}}
	svc := NewSettingService(repo, &config.Config{})

	settings, err := svc.GetPublicSettings(context.Background())

	require.NoError(t, err)
	require.Equal(t, defaultSiteName, settings.SiteName)
}
