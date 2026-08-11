// Package main is the chorecoin binary — a custom PocketBase build with the
// JS hooks and migrations embedded at compile time so the binary is fully
// self-contained. On startup it extracts the embedded assets to the user's
// OS cache directory (e.g. ~/Library/Caches/chorecoin on macOS, ~/.cache/
// chorecoin on Linux) and hands those paths to the JSVM plugin.
//
// Env overrides for development:
//
//	CHORECOIN_HOOKS_DIR       — skip embedded extraction, load hooks from here
//	CHORECOIN_MIGRATIONS_DIR  — skip embedded extraction, load migrations from here
//
// Both are useful when iterating on JS locally against a checked-out repo:
//
//	CHORECOIN_HOOKS_DIR=./pb_hooks CHORECOIN_MIGRATIONS_DIR=./pb_migrations \
//	  ./bin/chorecoin serve --http=127.0.0.1:18090 --dir=/tmp/chorecoin-dev
package main

import (
	"log"
	"os"
	"path/filepath"

	chorecoin "github.com/danielhemp/chore-coin"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

func main() {
	hooksDir, migrationsDir, err := resolveAssetDirs()
	if err != nil {
		log.Fatalf("resolve asset dirs: %v", err)
	}

	app := pocketbase.New()
	jsvm.MustRegister(app, jsvm.Config{
		HooksDir:      hooksDir,
		MigrationsDir: migrationsDir,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// resolveAssetDirs picks the on-disk locations of pb_hooks and pb_migrations
// that jsvm will load. Precedence:
//  1. CHORECOIN_HOOKS_DIR / CHORECOIN_MIGRATIONS_DIR env vars (dev use — bypass
//     the embedded copy so you can edit JS in-place without rebuilding).
//  2. Extract the embedded copies to $XDG_CACHE_HOME/chorecoin/assets/{hooks,
//     migrations} (or the OS equivalent) on every startup — idempotent and
//     costs a handful of ms.
func resolveAssetDirs() (hooksDir, migrationsDir string, err error) {
	if h := os.Getenv("CHORECOIN_HOOKS_DIR"); h != "" {
		hooksDir = h
	}
	if m := os.Getenv("CHORECOIN_MIGRATIONS_DIR"); m != "" {
		migrationsDir = m
	}
	if hooksDir != "" && migrationsDir != "" {
		return hooksDir, migrationsDir, nil
	}

	cacheRoot, err := os.UserCacheDir()
	if err != nil {
		cacheRoot = os.TempDir()
	}
	assetsRoot := filepath.Join(cacheRoot, "chorecoin", "assets")

	if hooksDir == "" {
		hooksDir = filepath.Join(assetsRoot, "hooks")
		if err := chorecoin.ExtractTo("pb_hooks", hooksDir); err != nil {
			return "", "", err
		}
	}
	if migrationsDir == "" {
		migrationsDir = filepath.Join(assetsRoot, "migrations")
		if err := chorecoin.ExtractTo("pb_migrations", migrationsDir); err != nil {
			return "", "", err
		}
	}
	return hooksDir, migrationsDir, nil
}
