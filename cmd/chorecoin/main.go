// Package main is the chorecoin binary — a custom PocketBase build that
// (eventually) embeds the Chore Coin frontend, hooks, and migrations so it
// ships as a single native executable per platform.
//
// v0 skeleton: registers the JSVM plugin so PocketBase loads our JS hooks and
// migrations from disk. Paths default to ./pb_hooks and ./pb_migrations
// relative to the current working directory, or can be overridden via env
// vars CHORECOIN_HOOKS_DIR and CHORECOIN_MIGRATIONS_DIR.
//
// Next commits will:
//   - //go:embed pb_hooks/, pb_migrations/, and frontend/dist/ into the binary
//   - extract them to a canonical per-platform data dir on first run
//   - add a setup wizard for the initial superuser + parent creation
//
// Run locally against the repo checkout:
//
//	./bin/chorecoin serve --http=127.0.0.1:18090 --dir=/tmp/chorecoin-dev
package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

func main() {
	app := pocketbase.New()

	hooksDir := envOr("CHORECOIN_HOOKS_DIR", "./pb_hooks")
	migrationsDir := envOr("CHORECOIN_MIGRATIONS_DIR", "./pb_migrations")

	// JSVM: loads *.js files from hooksDir as hooks (main.pb.js style) and from
	// migrationsDir as timestamped migrations. Types are watched in dev mode.
	jsvm.MustRegister(app, jsvm.Config{
		HooksDir:      hooksDir,
		MigrationsDir: migrationsDir,
		HooksWatch:    false, // set true during dev for live reload
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
